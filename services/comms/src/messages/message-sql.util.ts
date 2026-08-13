// Pure SQL-fragment builders, deliberately split out of messages.service.ts
// into their own side-effect-free module — that file creates a real Redis
// connection at import time (see its `redisPublisher`), which makes it
// unsafe to import in a unit test (jest hangs trying to connect). Nothing
// in this file touches a database or network.

// Aggregates emoji reactions per message as a JSON array — computed in
// SQL (not N+1 queried per message afterward) so history()/search()/
// thread listing all share the exact same shape with one extra join, not
// a per-message round trip. Takes the SQL parameter index the viewer's
// user id will be bound at ($N) so every caller can place that parameter
// wherever it lands in its own query's parameter list.
export function reactionsAggSql(viewerUserIdParamIndex: number): string {
  return `
    coalesce((
      select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'reactedByMe', r.reacted_by_me))
      from (
        select emoji, count(*) as cnt, bool_or(user_id = $${viewerUserIdParamIndex}) as reacted_by_me
        from message_reactions where message_id = m.id
        group by emoji
      ) r
    ), '[]'::jsonb) as reactions
  `;
}

export function chatRedisChannel(tenantId: string, channelId: string) {
  return `chat:${tenantId}:${channelId}`;
}
