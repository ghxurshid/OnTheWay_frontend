import { useCallback, useEffect, useState } from 'react';
import { T, partyColor } from '@/constants/theme';
import { t } from '@/i18n';
import { chatApi } from '@/api/chatApi';
import type { ConversationRow, MessageReceipt } from '@/api/chatApi';
import { authStore } from '@/services/authStore';
import { chatClient } from '@/services/realtime/chatClient';
import { NO_WATERMARKS, displayStatus, raiseWatermark, statusFromServer } from '@/services/messageStatus';
import type { Watermarks } from '@/services/messageStatus';
import { useAsync } from '@/hooks/useAsync';
import { useUnread } from '@/hooks/useUnread';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { MessageTicks } from '@/components/ui/MessageTicks';
import { initialsOf } from '@/utils/avatar';
import { fmtLastSeen } from '@/utils/datetime';
import { idOf } from '@/utils/ids';
import type { PartyType } from '@/models';

/** Who a chat is with — enough to open the chat screen. */
export interface ChatPeer { id: string; name: string; initials: string; type: PartyType }

interface ChatsPanelProps { onOpenChat: (peer: ChatPeer) => void }

const peerOf = (row: ConversationRow): ChatPeer => {
  const name = row.otherParticipantName || t('common.user');
  return {
    id: idOf(row.otherParticipantId),
    name,
    initials: initialsOf(name),
    type: row.otherParticipantKind === 'driver' ? 'driver' : 'passenger',
  };
};

/** Receipts that arrive while the inbox is open, per conversation — they lift
    the ✓ / ✓✓ of rows whose last message is mine. */
function useLiveReceipts(): Record<string, Watermarks> {
  const [byConversation, setByConversation] = useState<Record<string, Watermarks>>({});
  useEffect(() => {
    const raise = (kind: keyof Watermarks) => (r: MessageReceipt) => setByConversation((cur) => {
      const id = idOf(r.conversationId);
      return { ...cur, [id]: raiseWatermark(cur[id] ?? NO_WATERMARKS, kind, idOf(r.upToMessageId)) };
    });
    const offDelivered = chatClient.on('MessagesDelivered', raise('delivered'));
    const offRead = chatClient.on('MessagesRead', raise('read'));
    return () => { offDelivered(); offRead(); };
  }, []);
  return byConversation;
}

/** The inbox: everyone the user has talked to, latest first, with unread counts
    and — when the last message is mine — its receipt mark, as in Telegram. */
export function ChatsPanel({ onOpenChat }: ChatsPanelProps) {
  const loader = useCallback(() => chatApi.conversations(), []);
  const { data, loading, error, reload } = useAsync<ConversationRow[]>(loader, [], []);
  const unread = useUnread();
  const receipts = useLiveReceipts();
  const myId = idOf((authStore.getUser() as { id?: string } | null)?.id ?? '');

  if (loading) return <Spinner label={null} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const rows = data || [];
  if (rows.length === 0) {
    return <EmptyState icon="💬" title={t('chat.inboxEmptyTitle')} body={t('chat.inboxEmptyBody')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((row) => {
        const peer = peerOf(row);
        const color = partyColor(peer.type);
        const count = unread[peer.id] ?? row.unreadCount ?? 0;
        const mine = row.lastMessageSenderId != null && idOf(row.lastMessageSenderId) === myId;
        const lastStatus = mine && row.lastMessageId
          ? displayStatus(idOf(row.lastMessageId),
            statusFromServer({ deliveredAtUtc: row.lastMessageDeliveredAtUtc, readAtUtc: row.lastMessageReadAtUtc }),
            receipts[idOf(row.id)] ?? NO_WATERMARKS)
          : null;
        return (
          <button key={row.id} onClick={() => onOpenChat(peer)} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 12px', borderRadius: 14, border: `1px solid ${T.border}`, background: T.surface2,
            cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'DM Sans,sans-serif' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}22`, border: `1.5px solid ${color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontSize: 13, fontWeight: 700, color }}>{peer.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: count ? 700 : 600, color: T.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name}</span>
                <span style={{ fontSize: 10.5, color: T.muted, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {lastStatus && lastStatus !== 'failed' && <MessageTicks status={lastStatus} color={T.muted} readColor={T.teal} />}
                  {fmtLastSeen(row.lastMessageAtUtc)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ flex: 1, fontSize: 12, color: count ? T.text : T.muted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mine ? t('chat.you') : ''}{row.lastMessage || ''}
                </span>
                {count > 0 && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: T.teal, color: '#fff',
                    fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
