import React from 'react';
import { useParams } from 'react-router-dom';
import GroupChatInterface from './GroupChatInterface';

/**
 * Adapter component that passes chatId as groupId to GroupChatInterface
 */
const GroupChatInterfaceAdapter: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  
  if (!chatId) {
    return <div className="chat-error">Missing chat ID</div>;
  }

  return <GroupChatInterface overrideGroupId={chatId} />;
};

export default GroupChatInterfaceAdapter; 