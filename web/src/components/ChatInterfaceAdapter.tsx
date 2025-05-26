import React from 'react';
import { useParams } from 'react-router-dom';
import ChatInterface from './ChatInterface';

/**
 * Adapter component that passes chatId as friendId to ChatInterface
 */
const ChatInterfaceAdapter: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  
  if (!chatId) {
    return <div className="chat-error">Missing chat ID</div>;
  }

  return <ChatInterface overrideFriendId={chatId} />;
};

export default ChatInterfaceAdapter; 