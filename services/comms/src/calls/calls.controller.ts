import { Body, Controller, Get, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CallsService } from './calls.service';

@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  start(@Req() req: any, @Body() body: { channelId?: string; ticketKey?: string }) {
    return this.calls.startCall(req.user.tenant_id, req.user.sub, body.channelId ?? null, body.ticketKey ?? null);
  }

  // Static-segment routes ('recordings/...') must be declared BEFORE the
  // ':id' catch-all below — Nest matches in declaration order, so a
  // ':id'-first ordering would swallow "recordings" as a literal id.
  @Get('recordings/:recordingId/download')
  async downloadRecording(@Req() req: any, @Param('recordingId') recordingId: string, @Res() res: Response) {
    const result = await this.calls.downloadRecording(req.user.tenant_id, recordingId);
    if (!result) throw new NotFoundException('Recording not found');
    res.setHeader('content-type', 'video/webm');
    res.setHeader('content-disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.calls.get(req.user.tenant_id, id);
  }

  @Post(':id/join')
  join(@Req() req: any, @Param('id') id: string) {
    return this.calls.joinCall(req.user.tenant_id, id, req.user.sub);
  }

  @Post(':id/leave')
  leave(@Req() req: any, @Param('id') id: string) {
    return this.calls.leaveCall(req.user.tenant_id, id, req.user.sub);
  }

  @Post(':id/end')
  end(@Req() req: any, @Param('id') id: string) {
    return this.calls.endCall(req.user.tenant_id, id);
  }

  // Call-from-ticket paging (§11.6) — the caller resolves who to page
  // (e.g. an Incident's on-call chain) and passes the ids; this service
  // has no opinion on assignment/escalation policy, only delivery.
  @Post(':id/page')
  page(@Req() req: any, @Param('id') id: string, @Body() body: { ticketKey: string; userIds: string[] }) {
    return this.calls.pageForCall(req.user.tenant_id, id, body.ticketKey, body.userIds ?? []);
  }

  // Recording upload — base64-encoded inside the JSON body, same
  // convention services/artifacts's package publish endpoint uses (see
  // main.ts's raised body-size limit).
  @Post(':id/recording')
  uploadRecording(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { filename: string; dataBase64: string; durationSeconds?: number },
  ) {
    return this.calls.uploadRecording(
      req.user.tenant_id,
      id,
      req.user.sub,
      body.filename,
      Buffer.from(body.dataBase64, 'base64'),
      body.durationSeconds ?? null,
    );
  }
}
