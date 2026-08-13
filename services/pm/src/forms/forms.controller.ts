import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FormsService, FormField } from './forms.service';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      projectId: string;
      name: string;
      description?: string;
      isPublic?: boolean;
      defaultTicketType?: string;
      fields: FormField[];
    },
  ) {
    return this.forms.create(
      req.user.tenant_id,
      body.projectId,
      body.name,
      body.description,
      body.isPublic ?? false,
      body.defaultTicketType ?? 'task',
      body.fields,
      req.user.sub,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.forms.list(req.user.tenant_id, projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/submissions')
  listSubmissions(@Req() req: any, @Param('id') id: string) {
    return this.forms.listSubmissions(req.user.tenant_id, id);
  }

  // --- Public, anonymous routes — deliberately NOT behind JwtAuthGuard.
  // See FormsService's docblock for the SECURITY DEFINER pre-auth lookup
  // this relies on instead of RLS. ---

  @Get('public/:token')
  getPublicForm(@Param('token') token: string) {
    return this.forms.getPublicForm(token);
  }

  @Post('public/:token/submit')
  submitPublic(
    @Param('token') token: string,
    @Body() body: { data: Record<string, string>; submitterEmail?: string },
  ) {
    return this.forms.submitPublic(token, body.data, body.submitterEmail);
  }

  // Customer self-service portal (§13.7) — same public token, two more
  // anonymous reads: a submitter's own request history and the project's
  // public KB articles.
  @Get('public/:token/my-requests')
  getPublicRequests(@Param('token') token: string, @Query('email') email: string) {
    return this.forms.getPublicRequests(token, email);
  }

  @Get('public/:token/kb')
  getPublicKbArticles(@Param('token') token: string) {
    return this.forms.getPublicKbArticles(token);
  }
}
