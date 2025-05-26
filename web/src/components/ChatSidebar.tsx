import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "../redux/hooks";
import "../scss/ChatSidebar.scss";
import { FiPlus, FiUsers } from "react-icons/fi";
import CreateGroupDialog from "./CreateGroupDialog";

// Unified chat item interface to represent both direct messages and group chats
interface ChatItem {
  _id: string;
  name: string;
  avatar?: string;
  isGroup: boolean; // To distinguish between direct chats and group chats
  lastMessage?: {
    content: string;
    sender: string;
    createdAt: string;
    type?: string;
  };
  isOnline?: boolean; // For direct chats
  memberCount?: number; // For group chats
}

const ChatSidebar: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [chatList, setChatList] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAllChats = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem("token");

        // Fetch friends (direct messages)
        const friendsResponse = await axios.get(
          `https://italkconnect-v3.onrender.com/api/friendship`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // Fetch groups (group chats)
        const groupsResponse = await axios.get(
          "https://italkconnect-v3.onrender.com/api/groups/user/groups",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        // Process friends data
        const friendshipList = friendsResponse.data;
        const acceptedFriendships = friendshipList.filter(
          (friendship) => friendship.status === "accepted"
        );

        const directChats: ChatItem[] = [];

        // Create a list to hold promises for fetching last messages
        const lastMessagePromises: Array<Promise<any>> = [];

        // Prepare direct chat items
        for (const friendship of acceptedFriendships) {
          if (!friendship.requester || !friendship.recipient) {
            continue;
          }

          const friend =
            friendship.requester._id === user._id
              ? friendship.recipient
              : friendship.requester;

          if (!friend || !friend._id) {
            continue;
          }

          const chatItem: ChatItem = {
            _id: friend._id,
            name: friend.name || "Người dùng",
            avatar: friend.avt,
            isGroup: false,
            isOnline: false, // Default, can be updated via socket
          };

          directChats.push(chatItem);

          // Create a promise to fetch the last message for this chat
          const lastMessagePromise = axios
            .get(
              `https://italkconnect-v3.onrender.com/api/chat/last-message/${user._id}/${friend._id}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            )
            .then((response) => {
              const lastMessage = response.data;
              if (lastMessage) {
                // Find the corresponding chat item and add the last message
                const chat = directChats.find(
                  (chat) => chat._id === friend._id
                );
                if (chat) {
                  chat.lastMessage = {
                    content: lastMessage.content,
                    sender: lastMessage.sender,
                    createdAt: lastMessage.createdAt,
                    type: lastMessage.type,
                  };
                }
              }
            })
            .catch((error) => {
              console.error(
                `Error fetching last message for chat with ${friend._id}:`,
                error
              );
            });

          lastMessagePromises.push(lastMessagePromise);
        }

        // Process groups data
        const groups = groupsResponse.data;
        const groupChats: ChatItem[] = groups.map((group: any) => ({
          _id: group._id,
          name: group.name,
          avatar: group.avatarUrl,
          isGroup: true,
          lastMessage: group.lastMessage,
          memberCount: group.members.length,
        }));

        // Wait for all last message fetches to complete
        await Promise.allSettled(lastMessagePromises);

        // Combine and sort all chats by last activity
        const allChats = [...directChats, ...groupChats].sort((a, b) => {
          // If both have last messages, sort by date
          if (a.lastMessage && b.lastMessage) {
            return (
              new Date(b.lastMessage.createdAt).getTime() -
              new Date(a.lastMessage.createdAt).getTime()
            );
          }
          // If only one has a last message, it comes first
          if (a.lastMessage) return -1;
          if (b.lastMessage) return 1;
          // If neither has a last message, sort alphabetically
          return a.name.localeCompare(b.name);
        });

        setChatList(allChats);
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchAllChats();
  }, [user]);

  const handleChatClick = (chatItem: ChatItem) => {
    if (chatItem.isGroup) {
      navigate(`/chats/group/${chatItem._id}`);
    } else {
      navigate(`/chats/direct/${chatItem._id}`);
    }
  };

  const handleCreateGroup = () => {
    setShowCreateDialog(true);
  };

  // Format last activity time
  const formatLastActivity = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return diffDays === 1 ? "Yesterday" : `${diffDays} days ago`;
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours > 0) {
      return `${diffHours}h ago`;
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins > 0) {
      return `${diffMins}m ago`;
    }

    return "Just now";
  };

  // Get last message preview text
  const getLastMessagePreview = (chatItem: ChatItem) => {
    if (!chatItem.lastMessage) {
      return "No messages yet";
    }

    const senderName =
      chatItem.lastMessage.sender === user?._id
        ? "You"
        : chatItem.isGroup
        ? "Unknown"
        : chatItem.name;

    let content = chatItem.lastMessage.content;

    // Handle different message types
    if (chatItem.lastMessage.type) {
      switch (chatItem.lastMessage.type) {
        case "image":
          content = "📷 Image";
          break;
        case "video":
          content = "🎥 Video";
          break;
        case "audio":
          content = "🎵 Audio";
          break;
        case "file":
          content = "📄 File";
          break;
      }
    }

    return `${senderName}: ${content}`;
  };

  const renderAvatar = (chatItem: ChatItem) => {
    if (chatItem.avatar) {
      return (
        <img
          src={chatItem.avatar}
          alt={chatItem.name}
          className="chat-avatar"
        />
      );
    }

    return (
      <div className="avatar-placeholder">
        {chatItem.name.charAt(0).toUpperCase()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="chat-sidebar-loading">Đang tải danh sách chat...</div>
    );
  }

  if (error) {
    return <div className="chat-sidebar-error">{error}</div>;
  }

  if (chatList.length === 0) {
    return (
      <div className="chat-sidebar-empty">
        <p>Bạn chưa có cuộc trò chuyện nào.</p>
        <button className="btn btn-primary" onClick={() => navigate("/search")}>
          Tìm bạn mới
        </button>
      </div>
    );
  }

  return (
    <div className="chat-sidebar-container">
      <div className="chat-list-header">
        <h2>Chats</h2>
        <button className="create-group-button" onClick={handleCreateGroup}>
          <FiPlus /> Nhóm mới
        </button>
      </div>

      <div className="chat-list">
        {chatList.map((chat) => (
          <div
            key={`${chat.isGroup ? "group" : "direct"}-${chat._id}`}
            className="chat-item"
            onClick={() => handleChatClick(chat)}
          >
            <div className="chat-avatar-container">
              {renderAvatar(chat)}
              {!chat.isGroup && (
                <span
                  className={`online-status ${
                    chat.isOnline ? "online" : "offline"
                  }`}
                ></span>
              )}
            </div>

            <div className="chat-info">
              <div className="chat-name">{chat.name}</div>
              <div className="chat-preview">
                {chat.lastMessage
                  ? getLastMessagePreview(chat)
                  : chat.isGroup
                  ? "Không có tin nhắn"
                  : chat.isOnline
                  ? "Đang hoạt động"
                  : "Ngoại tuyến"}
              </div>
            </div>

            {chat.lastMessage && (
              <div className="last-activity">
                {formatLastActivity(chat.lastMessage.createdAt)}
              </div>
            )}

            {chat.isGroup && chat.memberCount && (
              <div className="member-count">
                <FiUsers /> {chat.memberCount}
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateDialog && (
        <CreateGroupDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
};

export default ChatSidebar;
