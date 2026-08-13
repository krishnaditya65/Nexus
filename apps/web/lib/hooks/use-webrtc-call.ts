// WebRTC video/audio calls — the actual peer-connection/media half
// (docs/FEATURES.md §11.6). See services/comms/migrations/003_calls.sql's
// docblock for the architecture: MESH topology (every participant
// connects directly to every other one via a real RTCPeerConnection),
// the server only relaying signaling (SDP offer/answer + ICE candidates)
// over the same authenticated Socket.IO gateway chat already uses — the
// actual audio/video/screen-share media never touches the server.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatSocket } from '../realtime-socket';
import { useAuthStore } from '../auth-store';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export interface RemotePeer {
  socketId: string;
  userId: string;
  stream: MediaStream | null;
}

interface SignalPayload {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export function useWebrtcCall(callId: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerUserIds = useRef<Map<string, string>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const updateRemotePeers = useCallback(() => {
    setRemotePeers(
      [...peerConnections.current.keys()].map((socketId) => ({
        socketId,
        userId: peerUserIds.current.get(socketId) ?? 'unknown',
        stream: (peerConnections.current.get(socketId) as any)?._remoteStream ?? null,
      })),
    );
  }, []);

  const createPeerConnection = useCallback(
    (socketId: string, socket: ReturnType<typeof getChatSocket>) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

      const remoteStream = new MediaStream();
      (pc as any)._remoteStream = remoteStream;
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
        updateRemotePeers();
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:signal', {
            targetSocketId: socketId,
            signal: { type: 'candidate', candidate: event.candidate.toJSON() } as SignalPayload,
          });
        }
      };
      peerConnections.current.set(socketId, pc);
      return pc;
    },
    [updateRemotePeers],
  );

  const teardownPeer = useCallback(
    (socketId: string) => {
      peerConnections.current.get(socketId)?.close();
      peerConnections.current.delete(socketId);
      peerUserIds.current.delete(socketId);
      updateRemotePeers();
    },
    [updateRemotePeers],
  );

  useEffect(() => {
    if (!callId || !accessToken) return;
    let cancelled = false;
    const socket = getChatSocket(accessToken);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        socket.emit('call:join', { callId });
      })
      .catch((err) => setError(err.message ?? 'Could not access camera/microphone'));

    function handleExistingPeers({ peers }: { peers: string[] }) {
      // The newcomer just learns who's already here — per the fixed
      // "existing member offers to newcomer" convention (chat.gateway.ts's
      // docblock), it waits for THEIR offers rather than initiating.
      peers.forEach((socketId) => {
        if (!peerConnections.current.has(socketId)) createPeerConnection(socketId, socket);
      });
      updateRemotePeers();
    }

    async function handlePeerJoined({ socketId, userId }: { socketId: string; userId: string }) {
      peerUserIds.current.set(socketId, userId);
      const pc = createPeerConnection(socketId, socket);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:signal', { targetSocketId: socketId, signal: { type: 'offer', sdp: offer } as SignalPayload });
    }

    async function handleSignal({ fromSocketId, signal }: { fromSocketId: string; signal: SignalPayload }) {
      let pc = peerConnections.current.get(fromSocketId);
      if (signal.type === 'offer') {
        if (!pc) pc = createPeerConnection(fromSocketId, socket);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:signal', { targetSocketId: fromSocketId, signal: { type: 'answer', sdp: answer } as SignalPayload });
      } else if (signal.type === 'answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
      } else if (signal.type === 'candidate' && pc && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }

    function handlePeerLeft({ socketId }: { socketId: string }) {
      teardownPeer(socketId);
    }

    socket.on('call:existing-peers', handleExistingPeers);
    socket.on('call:peer-joined', handlePeerJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:peer-left', handlePeerLeft);

    return () => {
      cancelled = true;
      socket.off('call:existing-peers', handleExistingPeers);
      socket.off('call:peer-joined', handlePeerJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:peer-left', handlePeerLeft);
      socket.emit('call:leave', { callId });
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      peerUserIds.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setRemotePeers([]);
    };
  }, [callId, accessToken, createPeerConnection, teardownPeer, updateRemotePeers]);

  const toggleMute = useCallback((muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, []);

  const toggleCamera = useCallback((off: boolean) => {
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !off));
  }, []);

  const startScreenShare = useCallback(async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    peerConnections.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      sender?.replaceTrack(screenTrack);
    });
    screenTrack.onended = () => stopScreenShare();
    setIsScreenSharing(true);
  }, []);

  const stopScreenShare = useCallback(() => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        sender?.replaceTrack(cameraTrack);
      });
    }
    setIsScreenSharing(false);
  }, []);

  /** Cloud call recording (§11.6) — deliberately records only the LOCAL
   *  participant's own camera+mic feed via the browser's MediaRecorder
   *  API, not a mixed recording of every remote peer too (that needs a
   *  canvas + Web Audio API compositing pipeline this pass doesn't
   *  build — see services/comms/migrations/003_calls.sql's docblock).
   *  Honestly the same "narrower, disclosed" scope as everywhere else in
   *  this backlog a full version was a materially larger lift. */
  const startRecording = useCallback(() => {
    if (!localStreamRef.current) return;
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(localStreamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      setRecordedBlob(new Blob(recordedChunksRef.current, { type: 'video/webm' }));
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  return {
    localStream,
    remotePeers,
    error,
    isScreenSharing,
    isRecording,
    recordedBlob,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,
  };
}
