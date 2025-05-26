import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

/**
 * Adapter component for group chats that extracts the chat ID from route params
 * and navigates to the GroupChatScreen with the proper parameters
 */
const GroupChatAdapter = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const params = route.params as any;
  
  useEffect(() => {
    if (params?.chatId) {
      // When replacing with GroupChat, don't pass functions as callback, use screenName instead
      navigation.replace('GroupChat', {
        groupId: params.chatId,
        groupName: params.chatName || 'Group Chat',
        groupAvatar: params.groupAvatar,
        returnScreen: 'MainTabs' // Use string instead of function
      });
    } else {
      // If no chatId, go back to the chat list
      navigation.navigate('MainTabs', { screen: 'ChatTab' });
    }
  }, [params]);

  // Return an empty View instead of null to avoid potential rendering issues
  return <View style={{ flex: 1 }} />;
};

export default GroupChatAdapter; 