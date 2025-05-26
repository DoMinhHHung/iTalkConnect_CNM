import React from "react";
import { useParams } from "react-router-dom";
import ChatSidebar from "../components/ChatSidebar";
import ChatInterfaceAdapter from "../components/ChatInterfaceAdapter";
import GroupChatInterfaceAdapter from "../components/GroupChatInterfaceAdapter";
import "../scss/UnifiedChatPage.scss";

const UnifiedChatPage: React.FC = () => {
  const { chatType, chatId } = useParams<{ chatType?: string; chatId?: string }>();
  
  const isGroupChat = chatType === "group";
  
  return (
    <div className="unified-chat-page">
      <div className="chat-container">
        <div className="chat-sidebar">
          <ChatSidebar />
        </div>
        <div className="chat-main">
          {chatId ? (
            isGroupChat ? (
              <GroupChatInterfaceAdapter />
            ) : (
              <ChatInterfaceAdapter />
            )
          ) : (
            <div className="welcome-container">
              <div className="welcome-icon">
                <i className="fas fa-comments"></i>
              </div>
              <h2>Chào mừng đến với iConnect Chat</h2>
              <p>Chọn một cuộc trò chuyện để bắt đầu</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnifiedChatPage; 