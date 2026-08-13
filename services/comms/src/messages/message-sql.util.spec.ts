import { reactionsAggSql, chatRedisChannel } from './message-sql.util';

describe('reactionsAggSql', () => {
  it('binds the viewer user id parameter at the given index', () => {
    const sql = reactionsAggSql(3);
    expect(sql).toContain('$3');
  });

  it('produces different SQL for different parameter indices (no hardcoded index)', () => {
    expect(reactionsAggSql(2)).not.toBe(reactionsAggSql(4));
  });

  it('aggregates reactions grouped by emoji, aliased as "reactions"', () => {
    const sql = reactionsAggSql(1);
    expect(sql).toContain('group by emoji');
    expect(sql).toContain('as reactions');
  });

  it('falls back to an empty JSON array when a message has no reactions', () => {
    expect(reactionsAggSql(1)).toContain("'[]'::jsonb");
  });

  it('computes reactedByMe as whether the bound viewer id appears among reactors', () => {
    const sql = reactionsAggSql(5);
    expect(sql).toContain('reacted_by_me');
    expect(sql).toContain('user_id = $5');
  });
});

describe('chatRedisChannel', () => {
  it('scopes the channel name by both tenant and channel id (no cross-tenant leakage)', () => {
    expect(chatRedisChannel('tenant-a', 'channel-1')).toBe('chat:tenant-a:channel-1');
  });

  it('produces distinct channel names for different tenants sharing a channel id', () => {
    expect(chatRedisChannel('tenant-a', 'channel-1')).not.toBe(chatRedisChannel('tenant-b', 'channel-1'));
  });
});
