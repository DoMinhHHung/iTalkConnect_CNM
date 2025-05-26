import React, { useState, useEffect, useContext, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { AuthContext } from "../../context/AuthContext";
import { API_URL, getAPIURL, getEndpointURL, API_ENDPOINTS } from "../../config/constants";
import moment from "moment";
import AsyncStorage from "@react-native-async-storage/async-storage";
import socketService from "../../services/socketService";
import { Socket } from "socket.io-client";
import groupChatService from "../../services/groupChatService";

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
  unreadCount?: number;
  isOnline?: boolean; // For direct chats
  memberCount?: number; // For group chats
  participants?: any[]; // For direct chats
}

const UnifiedChatScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useContext(AuthContext);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Load chats on component mount
  useEffect(() => {
    loadAllChats();
    const setupSocket = async () => {
      socketRef.current = await socketService.initSocket();

      if (!socketRef.current) {
        console.error("Failed to initialize socket for unified chat list");
        return;
      }

      // Listen for new messages to update chat list
      socketRef.current.on("receiveMessage", (newMessage: any) => {
        console.log("Received new message in unified chat list");

        // Check if this message has already been processed to prevent duplicates
        const messageId = newMessage._id;
        const tempId = newMessage._tempId || newMessage.tempId;

        if (socketService.isMessageReceived(messageId, tempId)) {
          console.log(
            `Unified chat list ignoring duplicate message: ${messageId}/${tempId}`
          );
          return;
        }

        // Mark this message as received to prevent future duplicates
        socketService.markMessageReceived(messageId, tempId);

        const senderId =
          typeof newMessage.sender === "object"
            ? newMessage.sender._id
            : newMessage.sender;

        const receiverId =
          typeof newMessage.receiver === "object"
            ? newMessage.receiver._id
            : newMessage.receiver;

        // Check if this is a group message
        const isGroupMessage =
          newMessage.chatType === "group" || newMessage.groupId;
        const groupId = newMessage.groupId;

        // Only process if this message is relevant to current user
        if (
          !isGroupMessage &&
          senderId !== user?._id &&
          receiverId !== user?._id
        ) {
          return;
        }

        if (isGroupMessage) {
          // Handle group message
          updateChatWithMessage(newMessage, true);
        } else {
          // Handle direct message
          updateChatWithMessage(newMessage, false);
        }
      });

      // Listen for user online status
      socketRef.current.on("userOnline", (userId: string) => {
        console.log("User online:", userId);
        updateUserOnlineStatus(userId, true);
      });

      socketRef.current.on("userOffline", (userId: string) => {
        console.log("User offline:", userId);
        updateUserOnlineStatus(userId, false);
      });

      socketRef.current.on("onlineUsers", (userIds: string[]) => {
        console.log("Online users:", userIds);
        updateAllOnlineStatus(userIds);
      });

      // Listen for group events
      socketRef.current.on("groupUpdate", (data: any) => {
        console.log("Group update received in unified chat:", data);
        loadAllChats();
      });
    };

    setupSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.off("receiveMessage");
        socketRef.current.off("userOnline");
        socketRef.current.off("userOffline");
        socketRef.current.off("onlineUsers");
        socketRef.current.off("groupUpdate");
      }
    };
  }, [user?._id]);

  const loadAllChats = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const token = await AsyncStorage.getItem("token");
      if (!token) {
        setError("Authentication token not found. Please log in again.");
        setLoading(false);
        return;
      }

      // Get the current API base URL
      const apiURL = await getAPIURL();
      
      // Fetch friends (direct messages)
      const friendsResponse = await axios.get(
        `${apiURL}/api/friendship`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Fetch groups (group chats)
      const groupsResponse = await axios.get(
        `${apiURL}/api/groups/user/groups`,
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
          name: friend.name || "Unknown User",
          avatar: friend.avt,
          isGroup: false,
          isOnline: false, // Default, can be updated via socket
        };
        
        directChats.push(chatItem);
        
        // Create a promise to fetch the last message for this chat
        const lastMessagePromise = axios.get(
          `${apiURL}/api/chat/last-message/${user._id}/${friend._id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ).then(response => {
          const lastMessage = response.data;
          if (lastMessage && lastMessage._id) {
            // Find the corresponding chat item and add the last message
            const chat = directChats.find(chat => chat._id === friend._id);
            if (chat) {
              chat.lastMessage = {
                content: lastMessage.content || "Empty message",
                sender: lastMessage.sender,
                createdAt: lastMessage.createdAt || new Date().toISOString(),
                type: lastMessage.type || "text"
              };
            }
          }
        }).catch(error => {
          // 404 errors are expected when there's no conversation yet
          if (error.response?.status !== 404) {
            console.error(`Error fetching last message for chat with ${friend._id}:`, error);
          }
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
        unreadCount: group.unreadCount || 0
      }));
      
      // Wait for all last message fetches to complete
      await Promise.allSettled(lastMessagePromises);

      // Combine and sort all chats by last activity
      const allChats = [...directChats, ...groupChats].sort((a, b) => {
        // If both have last messages, sort by date
        if (a.lastMessage && b.lastMessage) {
          return new Date(b.lastMessage.createdAt).getTime() - 
                 new Date(a.lastMessage.createdAt).getTime();
        }
        // If only one has a last message, it comes first
        if (a.lastMessage) return -1;
        if (b.lastMessage) return 1;
        // If neither has a last message, sort alphabetically
        return a.name.localeCompare(b.name);
      });

      setChats(allChats);
    } catch (err) {
      console.error("Error fetching chats:", err);
      setError("Failed to load chats. Please try again later.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Function to update chat list with new message
  const updateChatWithMessage = (message: any, isGroupMessage: boolean) => {
    if (!message) return;
    
    const chatId = isGroupMessage ? message.groupId : (
      message.sender === user?._id ? message.receiver : message.sender
    );
    
    if (!chatId) return;

    setChats(prevChats => {
      // Find the chat to update
      const chatIndex = prevChats.findIndex(
        chat => chat._id === chatId && chat.isGroup === isGroupMessage
      );
      
      // If chat not found, we'll need to reload all chats
      if (chatIndex === -1) {
        // Schedule a reload of all chats
        setTimeout(() => loadAllChats(), 300);
        return prevChats;
      }
      
      // Create updated chat list
      const updatedChats = [...prevChats];
      
      // Update the chat with the new message
      const updatedChat = {
        ...updatedChats[chatIndex],
        lastMessage: {
          content: message.content || "",
          sender: typeof message.sender === "object" ? message.sender._id : message.sender,
          createdAt: message.createdAt,
          type: message.type || "text"
        }
      };
      
      // Remove the chat from its current position
      updatedChats.splice(chatIndex, 1);
      // Add it back at the beginning (most recent)
      updatedChats.unshift(updatedChat);
      
      return updatedChats;
    });
  };

  // Update a single user's online status
  const updateUserOnlineStatus = (userId: string, isOnline: boolean) => {
    setChats(prevChats => {
      // Only update direct chats, not group chats
      return prevChats.map(chat => {
        if (!chat.isGroup && chat._id === userId) {
          return { ...chat, isOnline };
        }
        return chat;
      });
    });
  };
  
  // Update all online statuses based on array of online user IDs
  const updateAllOnlineStatus = (onlineUserIds: string[]) => {
    const onlineUserSet = new Set(onlineUserIds);
    
    setChats(prevChats => {
      return prevChats.map(chat => {
        if (!chat.isGroup) {
          return { ...chat, isOnline: onlineUserSet.has(chat._id) };
        }
        return chat;
      });
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllChats();
  };

  const navigateToCreateGroup = () => {
    navigation.navigate("CreateGroup");
  };

  const navigateToChat = (chat: ChatItem) => {
    if (chat.isGroup) {
      // Use direct route to GroupChatScreen
      navigation.navigate("GroupChat", {
        groupId: chat._id,      // expected by GroupChatScreen
        groupName: chat.name,   // expected by GroupChatScreen
        groupAvatar: chat.avatar
      });
    } else {
      // Use direct route to ChatDetailScreen
      navigation.navigate("ChatDetail", {
        chatId: chat._id,
        chatName: chat.name,
        contactId: chat._id,    // expected by ChatDetailScreen
        contactAvatar: chat.avatar
      });
    }
  };

  // Format last activity time
  const formatLastActivity = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
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

    // Handle sender name
    const senderName = 
      !chatItem.lastMessage.sender ? "" :
      chatItem.lastMessage.sender === user?._id ? "You" :
      chatItem.isGroup ? "" : 
      chatItem.name || "Unknown";

    // Handle content with type checking
    let content = chatItem.lastMessage.content || "";

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

    return senderName ? `${senderName}: ${content}` : content || "Message";
  };

  // Render avatar for chat item
  const renderAvatar = (chatItem: ChatItem) => {
    if (chatItem.avatar) {
      return (
        <Image 
          source={{ uri: chatItem.avatar }} 
          style={styles.avatar} 
        />
      );
    }

    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>
          {chatItem.name.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  // Render chat item
  const renderChatItem = ({ item }: { item: ChatItem }) => {
    // Ensure all chat properties are valid to prevent rendering issues
    const chatName = item.name || "Unknown";
    
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigateToChat(item)}
        accessibilityLabel={`Chat with ${chatName}`}
      >
        <View style={styles.avatarContainer}>
          {renderAvatar(item)}
          {!item.isGroup && (
            <View
              style={[
                styles.onlineIndicator,
                item.isOnline ? styles.online : styles.offline,
              ]}
            />
          )}
        </View>

        <View style={styles.chatInfo}>
          <Text style={styles.chatName} numberOfLines={1}>
            {chatName}
          </Text>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {item.lastMessage 
              ? getLastMessagePreview(item) 
              : item.isGroup 
                ? "No messages yet" 
                : item.isOnline 
                  ? "Online" 
                  : "Offline"}
          </Text>
        </View>

        <View style={styles.chatMeta}>
          {item.lastMessage && (
            <Text style={styles.timestamp}>
              {formatLastActivity(item.lastMessage.createdAt)}
            </Text>
          )}

          {item.unreadCount && item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </Text>
            </View>
          )}

          {item.isGroup && item.memberCount && (
            <View style={styles.memberCount}>
              <Ionicons name="people-outline" size={14} color="#777" />
              <Text style={styles.memberCountText}>
                {item.memberCount}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubble-ellipses-outline" size={60} color="#ccc" />
      <Text style={styles.emptyTitle}>No Chats Yet</Text>
      <Text style={styles.emptyText}>
        Start a conversation with friends or create a new group
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={navigateToCreateGroup}
      >
        <Text style={styles.createButtonText}>Create Group</Text>
      </TouchableOpacity>
    </View>
  );

  // Render the header with create group button
  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Messages</Text>
      <TouchableOpacity
        style={styles.createGroupButton}
        onPress={navigateToCreateGroup}
      >
        <Ionicons name="add-circle" size={24} color="#2196F3" />
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading chats...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadAllChats}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => `${item.isGroup ? 'group' : 'direct'}-${item._id || 'unknown'}`}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={chats.length === 0 ? styles.emptyList : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2196F3"]}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#777",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  createGroupButton: {
    padding: 4,
  },
  chatItem: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#eee",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#fff",
  },
  online: {
    backgroundColor: "#4CAF50",
  },
  offline: {
    backgroundColor: "#ccc",
  },
  chatInfo: {
    flex: 1,
    marginRight: 8,
  },
  chatName: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 4,
  },
  chatPreview: {
    color: "#777",
    fontSize: 14,
  },
  chatMeta: {
    alignItems: "flex-end",
  },
  timestamp: {
    color: "#999",
    fontSize: 12,
    marginBottom: 4,
  },
  unreadBadge: {
    backgroundColor: "#2196F3",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  memberCount: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  memberCountText: {
    color: "#777",
    fontSize: 12,
    marginLeft: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#777",
    marginBottom: 20,
  },
  emptyList: {
    flex: 1,
  },
  createButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  createButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  errorContainer: {
    padding: 16,
    backgroundColor: "#ffebee",
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    color: "#d32f2f",
    flex: 1,
  },
  retryButton: {
    backgroundColor: "#d32f2f",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  retryText: {
    color: "#fff",
    fontWeight: "bold",
  },
});

export default UnifiedChatScreen; 