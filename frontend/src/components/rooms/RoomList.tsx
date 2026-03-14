import { useEffect, useState } from 'react';
import { useRoomStore } from '../../stores/room-store';
import { CreateRoomModal } from './CreateRoomModal';

interface RoomListProps {
  onSelectRoom: (roomId: string) => void;
}

export function RoomList({ onSelectRoom }: RoomListProps) {
  const rooms = useRoomStore((s) => s.rooms);
  const activeRoomId = useRoomStore((s) => s.activeRoomId);
  const unreadCounts = useRoomStore((s) => s.unreadCounts);
  const messagesByRoom = useRoomStore((s) => s.messagesByRoom);
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch rooms on mount
  useEffect(() => {
    const tk = localStorage.getItem('token');
    const hdrs: Record<string, string> = {};
    if (tk) hdrs['Authorization'] = `Bearer ${tk}`;
    fetch('/api/rooms', { headers: hdrs })
      .then((r) => r.ok ? r.json() : { rooms: [] })
      .then((data) => {
        useRoomStore.getState().setRooms(data.rooms || []);
        useRoomStore.getState().setPgEnabled(data.pgEnabled ?? false);
        if (data.unreadCounts) {
          useRoomStore.getState().setUnreadCounts(data.unreadCounts);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Channels</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-700 text-gray-500 hover:text-gray-300 transition-colors"
          title="Create Channel"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-px">
        {rooms.length === 0 ? (
          <div className="text-center py-8 px-2">
            <p className="text-[12px] text-gray-500">No channels yet</p>
            <p className="text-[11px] text-gray-600 mt-1">Create one to get started</p>
          </div>
        ) : (
          rooms.map((room) => {
            const unread = unreadCounts[room.id] || 0;
            const lastMessages = messagesByRoom[room.id];
            const lastMsg = lastMessages?.[lastMessages.length - 1];
            const isActive = room.id === activeRoomId;
            const hasUnread = unread > 0;

            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`w-full text-left px-2 py-1 rounded transition-colors group ${
                  isActive
                    ? 'bg-primary-600/20 text-gray-100'
                    : 'hover:bg-surface-800/60 text-gray-400'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[14px] shrink-0 ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>#</span>
                    <span className={`text-[13px] truncate ${
                      isActive ? 'text-gray-100' : hasUnread ? 'text-gray-200 font-semibold' : 'text-gray-400'
                    }`}>
                      {room.name}
                    </span>
                  </div>
                  {hasUnread && (
                    <span className="ml-1 px-1.5 py-0.5 bg-primary-600 text-[10px] font-bold text-white rounded-full min-w-[18px] text-center shrink-0">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
                {lastMsg && (
                  <p className={`text-[11px] truncate mt-0.5 pl-5 ${isActive ? 'text-gray-400' : 'text-gray-600'}`}>
                    {lastMsg.senderName ? `${lastMsg.senderName}: ` : ''}
                    {lastMsg.content.slice(0, 60)}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
