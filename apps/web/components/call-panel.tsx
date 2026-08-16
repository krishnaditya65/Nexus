'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWebrtcCall } from '@/lib/hooks/use-webrtc-call';
import { useEndCall, useUploadRecording } from '@/lib/hooks/use-calls';

function VideoTile({ stream, label, muted }: { stream: MediaStream | null; label: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{label}</span>
    </div>
  );
}

/** WebRTC call UI (docs/FEATURES.md §11.6) — one grid of video tiles (self
 *  + every mesh peer), mute/camera/screen-share/record/hang-up controls.
 *  See use-webrtc-call.ts's docblock for the mesh-topology architecture
 *  this renders. */
export function CallPanel({ callId, onClose }: { callId: string; onClose: () => void }) {
  const t = useTranslations('calls');
  const call = useWebrtcCall(callId);
  const endCall = useEndCall();
  const uploadRecording = useUploadRecording();

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done'>('idle');

  async function handleStopRecordingAndUpload() {
    try {
      await call.stopRecording();
    } catch {
      setUploadStatus('idle');
    }
  }

  useEffect(() => {
    if (!call.recordedBlob) return;
    setUploadStatus('uploading');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadRecording.mutate(
        { callId, filename: `recording-${Date.now()}.webm`, dataBase64: base64 },
        { onSuccess: () => setUploadStatus('done'), onError: () => setUploadStatus('idle') },
      );
    };
    reader.onerror = () => setUploadStatus('idle');
    reader.readAsDataURL(call.recordedBlob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.recordedBlob]);

  function hangUp() {
    endCall.mutate({ callId });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface p-4">
      {call.error && <p className="mb-2 text-sm text-danger">{call.error}</p>}

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
        <VideoTile stream={call.localStream} label={t('you')} muted />
        {call.remotePeers.map((p) => (
          <VideoTile key={p.socketId} stream={p.stream} label={p.userId} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          className="rounded border border-border px-3 py-2 text-sm hover:bg-surface-raised"
          onClick={() => {
            setMuted((m) => !m);
            call.toggleMute(!muted);
          }}
        >
          {muted ? t('unmute') : t('mute')}
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-sm hover:bg-surface-raised"
          onClick={() => {
            setCameraOff((c) => !c);
            call.toggleCamera(!cameraOff);
          }}
        >
          {cameraOff ? t('cameraOn') : t('cameraOff')}
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-sm hover:bg-surface-raised"
          onClick={() => (call.isScreenSharing ? call.stopScreenShare() : call.startScreenShare())}
        >
          {call.isScreenSharing ? t('stopScreenShare') : t('shareScreen')}
        </button>
        <button
          className="rounded border border-border px-3 py-2 text-sm hover:bg-surface-raised"
          onClick={() => (call.isRecording ? handleStopRecordingAndUpload() : call.startRecording())}
        >
          {call.isRecording ? t('stopRecording') : t('startRecording')}
        </button>
        <button className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90" onClick={hangUp}>
          {t('hangUp')}
        </button>
      </div>
      {uploadStatus === 'uploading' && <p className="mt-2 text-center text-xs text-text-secondary">{t('uploadingRecording')}</p>}
      {uploadStatus === 'done' && <p className="mt-2 text-center text-xs text-success">{t('recordingSaved')}</p>}
      <p className="mt-1 text-center text-xs text-text-secondary">{t('recordingNotice')}</p>
    </div>
  );
}
