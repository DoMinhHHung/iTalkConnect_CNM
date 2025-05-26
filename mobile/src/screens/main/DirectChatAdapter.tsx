import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

/**
 * Adapter component for direct chats that extracts the chat ID from route params
 * and navigates to the ChatDetailScreen with the proper parameters
 */
const DirectChatAdapter = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const params = route.params as any;
  
  useEffect(() => {
    if (params?.chatId) {
      // When replacing with ChatDetail, don't pass functions as callback, use screenName instead
      navigation.replace('ChatDetail', {
        chatId: params.chatId,
        chatName: params.chatName || 'Chat',
        contactId: params.chatId,
        contactAvatar: params.contactAvatar,
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

export default DirectChatAdapter; 