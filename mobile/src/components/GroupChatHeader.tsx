import React from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupChatStyles } from '../styles/GroupChatStyles';

interface GroupChatHeaderProps {
  navigation: any;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  userRole: string;
  members: any[];
  typingUsers: { [key: string]: string };
  navigateToGroupDetails: () => void;
  returnScreen?: string;
}

const GroupChatHeader: React.FC<GroupChatHeaderProps> = ({
  navigation,
  groupId,
  groupName,
  groupAvatarUrl,
  userRole,
  members,
  typingUsers,
  navigateToGroupDetails,
  returnScreen
}) => {
  return (
    <View style={groupChatStyles.header}>
      <TouchableOpacity
        onPress={() => {
          if (returnScreen === 'MainTabs') {
            navigation.navigate('MainTabs', { screen: 'ChatTab' });
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('MainTabs', { screen: 'ChatTab' });
          }
        }}
        style={groupChatStyles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={navigateToGroupDetails}
        style={groupChatStyles.groupInfo}
        activeOpacity={0.7}
      >
        {groupAvatarUrl ? (
          <Image 
            source={{ uri: groupAvatarUrl }} 
            style={groupChatStyles.groupAvatar} 
          />
        ) : (
          <View style={groupChatStyles.defaultAvatar}>
            <Text style={groupChatStyles.defaultAvatarText}>
              {groupName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={groupChatStyles.groupTextContainer}>
          <Text style={groupChatStyles.groupName} numberOfLines={1}>
            {groupName}
            {userRole === "admin" && <Text style={groupChatStyles.roleBadge}> (Admin)</Text>}
            {userRole === "co-admin" && <Text style={groupChatStyles.roleBadge}> (Co-Admin)</Text>}
          </Text>
          <Text style={groupChatStyles.onlineStatus}>
            {Object.keys(typingUsers).length > 0 
              ? `${Object.values(typingUsers).join(", ")} typing...` 
              : members.length > 0 ? `${members.length} members` : "Group Chat"}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => {
          if (userRole === "admin" || userRole === "co-admin") {
            // Hiển thị menu với các tùy chọn quản lý nhóm
            Alert.alert(
              "Quản lý nhóm",
              "",
              [
                {
                  text: "Chi tiết nhóm",
                  onPress: navigateToGroupDetails
                },
                {
                  text: "Thêm thành viên",
                  onPress: () => navigation.navigate("GroupDetails", { 
                    groupId,
                    groupName,
                    groupAvatar: groupAvatarUrl,
                    initialTab: "add-members"
                  })
                },
                {
                  text: "Hủy",
                  style: "cancel"
                }
              ]
            );
          } else {
            // Người dùng thường chỉ xem chi tiết nhóm
            navigateToGroupDetails();
          }
        }}
        style={groupChatStyles.infoButton}
      >
        <Ionicons
          name="information-circle-outline"
          size={24}
          color="#333"
        />
      </TouchableOpacity>
    </View>
  );
};

export default GroupChatHeader; 