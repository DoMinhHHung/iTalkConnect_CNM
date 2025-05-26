import React, { useContext, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../config/api';
import { AuthContext } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as cloudinaryService from '../../services/cloudinaryService';
import * as groupPermissionService from "../../services/groupPermissionService";
import socketService from "../../services/socketService";

interface Member {
  _id: string;
  name: string;
  avt: string;
  email?: string;
}

interface GroupInfo {
  _id: string;
  name: string;
  description?: string;
  members: Member[];
  admin: Member;
  coAdmins: Member[];
  createdAt: string;
  avatar?: string;
}

const GroupDetailsScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useContext(AuthContext);
  const { groupId, groupAvatar } = route.params || {};

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [userPermissions, setUserPermissions] = useState({
    isAdmin: false,
    isCoAdmin: false,
  });
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [contacts, setContacts] = useState<Member[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  // Add states for group editing
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedAvatar, setEditedAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [updatingGroup, setUpdatingGroup] = useState(false);
  
  // Add socket reference
  const socketRef = useRef<any>(null);
  const [isMounted, setIsMounted] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    
    if (groupId) {
      loadGroupInfo();
      checkUserPermissions();
      setupSocket();
    }
    
    return () => {
      setIsMounted(false);
      cleanupSocket();
    };
  }, [groupId]);

  // Setup socket connection for real-time updates
  const setupSocket = async () => {
    try {
      console.log("Setting up socket for group details:", groupId);
      
      // Get socket instance with robust connection
      const socket = await socketService.initSocket(true);
      if (!socket) {
        console.error("Failed to initialize socket for group details");
        return;
      }
      
      socketRef.current = socket;
      
      // Join standardized room format
      const standardRoomId = `group:${groupId}`;
      socket.emit("joinRoom", { roomId: standardRoomId });
      socket.emit("joinGroupRoom", { groupId });
      
      // Set up event listeners for group updates
      socket.off("groupUpdate");
      socket.off("memberUpdate");
      socket.off("groupMemberAdded");
      socket.off("groupMemberRemoved");
      socket.off("groupDeleted");
      socket.off("remoteUpdate");
      
      // Listen for group updates
      socket.on("groupUpdate", (data: any) => {
        if (data.groupId === groupId) {
          console.log("Group update received, refreshing group info");
          loadGroupInfo();
        }
      });
      
      // Listen for member status changes
      socket.on("memberUpdate", (data: any) => {
        if (data.groupId === groupId) {
          console.log("Member update received, refreshing group info");
          loadGroupInfo();
        }
      });
      
      // Listen for new members
      socket.on("groupMemberAdded", (data: any) => {
        if (data.groupId === groupId) {
          console.log("New member added, refreshing group info");
          loadGroupInfo();
        }
      });
      
      // Listen for removed members
      socket.on("groupMemberRemoved", (data: any) => {
        if (data.groupId === groupId) {
          console.log("Member removed, refreshing group info");
          loadGroupInfo();
          
          // If current user was removed, navigate back
          if (data.memberId === user._id) {
            Alert.alert("Removed", "You have been removed from the group");
            navigation.navigate('Chat');
          }
        }
      });
      
      // Listen for group deletion
      socket.on("groupDeleted", (data: any) => {
        if (data.groupId === groupId) {
          Alert.alert("Group Deleted", "This group has been deleted");
          navigation.navigate('Chat');
        }
      });
      
      // Generic remote update event
      socket.on("remoteUpdate", (data: any) => {
        if (data.type === "groupUpdate" && data.groupId === groupId) {
          console.log("Remote group update received, refreshing data");
          loadGroupInfo();
        }
      });
      
      // Handle reconnection
      socket.on("connect", () => {
        console.log("Socket reconnected, rejoining group rooms");
        socket.emit("joinRoom", { roomId: standardRoomId });
        socket.emit("joinGroupRoom", { groupId });
      });
      
    } catch (error) {
      console.error("Socket setup error in group details:", error);
    }
  };
  
  // Clean up socket connections
  const cleanupSocket = () => {
    if (socketRef.current) {
      socketRef.current.off("groupUpdate");
      socketRef.current.off("memberUpdate");
      socketRef.current.off("groupMemberAdded");
      socketRef.current.off("groupMemberRemoved");
      socketRef.current.off("groupDeleted");
      socketRef.current.off("remoteUpdate");
      
      // Leave the group room
      if (socketRef.current.connected) {
        socketRef.current.emit("leaveRoom", { roomId: `group:${groupId}` });
        socketRef.current.emit("leaveGroupRoom", { groupId });
      }
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Sorry, we need camera roll permissions to upload images.');
      }
    }
  };

  const loadGroupInfo = async () => {
    try {
      setLoading(true);
      
      // Sử dụng service mới để lấy thông tin nhóm
      const group = await groupPermissionService.getGroupInfo(groupId);
      
      if (group) {
        setGroupInfo(group);
        setEditedName(group.name || '');
        setEditedDescription(group.description || '');
        setEditedAvatar(group.avatar || null);
      } else {
        Alert.alert('Error', 'Failed to load group information.');
      }
    } catch (error) {
      console.error('Failed to load group info:', error);
      Alert.alert('Error', 'Failed to load group information.');
    } finally {
      setLoading(false);
    }
  };

  const checkUserPermissions = async () => {
    try {
      // Sử dụng service mới
      const role = await groupPermissionService.checkUserPermissions(groupId, user._id);
      
      setUserPermissions({
        isAdmin: role === "admin",
        isCoAdmin: role === "co-admin",
      });
    } catch (error) {
      console.error("Error checking permissions:", error);
      setUserPermissions({
        isAdmin: false,
        isCoAdmin: false,
      });
    }
  };

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      
      // Get token from storage
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        return;
      }
      
      // Get contacts
      const response = await axios.get(`${API_URL}/api/friendship`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data && Array.isArray(response.data)) {
        // Process friendship data to get contacts
        const contactsList = response.data
          .filter(friendship => friendship.status === 'accepted')
          .map(friendship => {
            // Determine which user is the friend
            const friendData = friendship.requester?._id === user?._id 
              ? friendship.recipient 
              : friendship.requester;
              
            return {
              _id: friendData?._id || '',
              name: friendData?.name || 'Unknown',
              email: friendData?.email || '',
              avt: friendData?.avt || ''
            };
          })
          .filter(contact => contact._id); // Filter out any invalid contacts
        
        // Filter out members already in the group
        const existingMemberIds = groupInfo?.members.map(m => m._id) || [];
        const filteredContacts = contactsList.filter(
          contact => !existingMemberIds.includes(contact._id)
        );
        
        setContacts(filteredContacts);
        console.log(`Loaded ${filteredContacts.length} contacts for potential adding to group`);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
      // Try a secondary endpoint as fallback
      try {
        console.log('Trying alternate endpoint for contacts...');
        const token = await AsyncStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/friends`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.data && Array.isArray(response.data)) {
          // Filter out members already in the group
          const existingMemberIds = groupInfo?.members.map(m => m._id) || [];
          const filteredContacts = response.data.filter(
            contact => !existingMemberIds.includes(contact._id)
          );
          
          setContacts(filteredContacts);
          console.log(`Loaded ${filteredContacts.length} contacts from alternate endpoint`);
        }
      } catch (fallbackError) {
        console.error('Fallback endpoint also failed:', fallbackError);
        Alert.alert('Error', 'Could not load your contacts. Please try again later.');
      }
    } finally {
      setLoadingContacts(false);
    }
  };

  const addMember = async (memberId: string) => {
    try {
      // Sử dụng service mới
      const success = await groupPermissionService.addGroupMember(groupId, memberId);
      
      if (success) {
        loadGroupInfo();
        setShowAddMemberModal(false);
        
        // Notify others about the member addition via socket
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("notifyGroupUpdate", {
            type: "memberAdded",
            groupId,
            memberId,
            actorId: user._id
          });
        }
      } else {
        Alert.alert('Error', 'Failed to add member to group.');
      }
    } catch (error) {
      console.error('Failed to add member:', error);
      Alert.alert('Error', 'Failed to add member to group.');
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      // Don't allow removing the admin
      if (groupInfo?.admin._id === memberId) {
        Alert.alert('Error', 'Cannot remove the group admin.');
        return;
      }
      
      // Confirm before removing
      Alert.alert(
        'Remove Member',
        'Are you sure you want to remove this member from the group?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Sử dụng service mới
              const success = await groupPermissionService.removeGroupMember(groupId, memberId);
              
              if (success) {
                loadGroupInfo();
                
                // Notify others via socket
                if (socketRef.current && socketRef.current.connected) {
                  socketRef.current.emit("notifyGroupUpdate", {
                    type: "memberRemoved",
                    groupId,
                    memberId,
                    actorId: user._id
                  });
                }
              } else {
                Alert.alert('Error', 'Failed to remove member from group.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to remove member:', error);
      Alert.alert('Error', 'Failed to remove member from group.');
    }
  };

  const promoteToCoAdmin = async (memberId: string) => {
    try {
      // Sử dụng service mới
      const success = await groupPermissionService.promoteToCoAdmin(groupId, memberId);
      
      if (success) {
        loadGroupInfo();
      } else {
        Alert.alert('Error', 'Failed to promote member to co-admin.');
      }
    } catch (error) {
      console.error('Failed to promote to co-admin:', error);
      Alert.alert('Error', 'Failed to promote member to co-admin.');
    }
  };

  const demoteFromCoAdmin = async (memberId: string) => {
    try {
      // Sử dụng service mới
      const success = await groupPermissionService.demoteFromCoAdmin(groupId, memberId);
      
      if (success) {
        loadGroupInfo();
      } else {
        Alert.alert('Error', 'Failed to demote co-admin.');
      }
    } catch (error) {
      console.error('Failed to demote from co-admin:', error);
      Alert.alert('Error', 'Failed to demote co-admin.');
    }
  };

  const leaveGroup = async () => {
    // Confirm before leaving
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get token from storage
              const token = await AsyncStorage.getItem('token');
              
              if (!token) {
                return;
              }
              
              // Leave group (remove self)
              await axios.post(
                `${API_URL}/api/groups/remove-member`,
                {
                  groupId,
                  memberId: user._id,
                },
                {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              // Navigate back to chats
              navigation.navigate('Chat');
            } catch (error) {
              console.error('Failed to leave group:', error);
              Alert.alert('Error', 'Failed to leave group.');
            }
          },
        },
      ]
    );
  };

  const deleteGroup = async () => {
    // Confirm before deleting
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Sử dụng service mới
              const success = await groupPermissionService.deleteGroup(groupId);
              
              if (success) {
                // Notify all members about deletion
                if (socketRef.current && socketRef.current.connected) {
                  socketRef.current.emit("notifyGroupDeleted", {
                    groupId,
                    actorId: user._id
                  });
                }
                
                navigation.navigate('Chat');
              } else {
                Alert.alert('Error', 'Failed to delete group.');
              }
            } catch (error) {
              console.error('Failed to delete group:', error);
              Alert.alert('Error', 'Failed to delete group.');
            }
          },
        },
      ]
    );
  };

  const handleOpenAddMemberModal = () => {
    setShowAddMemberModal(true);
    loadContacts();
  };

  const navigateToGroupChat = () => {
    if (groupInfo) {
      navigation.navigate('GroupChat', {
        groupId: groupInfo._id,
        groupName: groupInfo.name,
        groupAvatar: groupInfo.avatar
      });
    }
  };

  // New methods for editing group
  const openEditModal = () => {
    setEditedName(groupInfo?.name || '');
    setEditedDescription(groupInfo?.description || '');
    setEditedAvatar(groupInfo?.avatar || null);
    requestPermissions();
    setShowEditModal(true);
  };

  const pickGroupAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingAvatar(true);
        setUploadProgress(0);
        
        const uri = result.assets[0].uri;
        
        try {
          // Upload to cloudinary
          const cloudinaryResponse = await cloudinaryService.uploadImage(
            uri,
            "group_avatar",
            (progress) => {
              setUploadProgress(progress);
            }
          );
          
          if (cloudinaryResponse && cloudinaryResponse.secure_url) {
            setEditedAvatar(cloudinaryResponse.secure_url);
            console.log('Group avatar uploaded:', cloudinaryResponse.secure_url);
          }
        } catch (error) {
          console.error('Failed to upload avatar:', error);
          Alert.alert('Error', 'Failed to upload avatar. Please try again.');
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
      setUploadingAvatar(false);
    }
  };

  const updateGroupSettings = async () => {
    if (!editedName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty');
      return;
    }
    
    try {
      setUpdatingGroup(true);
      
      const updateData = {
        name: editedName.trim(),
        description: editedDescription.trim(),
        avatar: editedAvatar
      };
      
      // Sử dụng service mới
      const success = await groupPermissionService.updateGroupInfo(groupId, updateData);
      
      if (success) {
        await loadGroupInfo();
        setShowEditModal(false);
        
        // Notify all clients about the update
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("notifyGroupUpdate", {
            type: "groupInfoUpdated",
            groupId,
            actorId: user._id,
            changes: updateData
          });
          
          // Also send a generic update for web clients
          socketRef.current.emit("remoteUpdate", {
            type: "groupUpdate",
            groupId,
            sender: user._id
          });
        }
        
        Alert.alert('Success', 'Group settings updated successfully');
      } else {
        Alert.alert('Error', 'Failed to update group settings.');
      }
    } catch (error) {
      console.error('Failed to update group:', error);
      Alert.alert('Error', 'Failed to update group settings.');
    } finally {
      setUpdatingGroup(false);
    }
  };

  // Filter contacts by search text
  const filteredContacts = contacts.filter(contact => 
    contact.name.toLowerCase().includes(searchText.toLowerCase()) ||
    (contact.email && contact.email.toLowerCase().includes(searchText.toLowerCase()))
  );

  // Render group avatar or placeholder
  const renderGroupAvatar = () => {
    if (groupInfo?.avatar) {
      return (
        <Image 
          source={{ uri: groupInfo.avatar }} 
          style={styles.groupImage} 
        />
      );
    }
    
    return (
      <View style={styles.groupAvatar}>
        <Text style={styles.groupInitial}>{groupInfo?.name.charAt(0)}</Text>
      </View>
    );
  };

  // Render avatar in edit modal
  const renderEditAvatar = () => {
    if (uploadingAvatar) {
      return (
        <View style={styles.editAvatarContainer}>
          <ActivityIndicator size="small" color="#0084ff" />
          <Text style={styles.uploadProgressText}>{uploadProgress.toFixed(0)}%</Text>
        </View>
      );
    }
    
    return (
      <TouchableOpacity 
        style={styles.editAvatarContainer} 
        onPress={pickGroupAvatar}
      >
        {editedAvatar ? (
          <Image 
            source={{ uri: editedAvatar }} 
            style={styles.editAvatar} 
          />
        ) : (
          <View style={styles.editAvatarPlaceholder}>
            <Ionicons name="camera" size={24} color="#999" />
            <Text style={styles.editAvatarText}>Change Avatar</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007BFF" />
      </SafeAreaView>
    );
  }

  if (!groupInfo) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text>Group not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Details</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <View style={styles.groupInfoContainer}>
        <View style={styles.groupAvatarContainer}>
          {renderGroupAvatar()}
        </View>
        <Text style={styles.groupName}>{groupInfo.name}</Text>
        {groupInfo.description && (
          <Text style={styles.groupDescription}>{groupInfo.description}</Text>
        )}
        <Text style={styles.memberCount}>
          {groupInfo.members.length} {groupInfo.members.length === 1 ? 'Member' : 'Members'}
        </Text>
        
        {/* Add edit button for admins and co-admins */}
        {(userPermissions.isAdmin || userPermissions.isCoAdmin) && (
          <TouchableOpacity 
            style={styles.editButton}
            onPress={openEditModal}
          >
            <Ionicons name="create-outline" size={16} color="#0084ff" />
            <Text style={styles.editButtonText}>Edit Group Info</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={navigateToGroupChat}
        >
          <Ionicons name="chatbubbles" size={24} color="#007BFF" />
          <Text style={styles.actionButtonText}>Chat</Text>
        </TouchableOpacity>
        
        {(userPermissions.isAdmin || userPermissions.isCoAdmin) && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleOpenAddMemberModal}
          >
            <Ionicons name="person-add" size={24} color="#007BFF" />
            <Text style={styles.actionButtonText}>Add Members</Text>
          </TouchableOpacity>
        )}
        
        {!userPermissions.isAdmin && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={leaveGroup}
          >
            <Ionicons name="exit-outline" size={24} color="#FF3B30" />
            <Text style={[styles.actionButtonText, styles.leaveText]}>Leave Group</Text>
          </TouchableOpacity>
        )}
        
        {userPermissions.isAdmin && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={deleteGroup}
          >
            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            <Text style={[styles.actionButtonText, styles.leaveText]}>Delete Group</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.membersSection}>
        <Text style={styles.sectionTitle}>Members</Text>
        
        <FlatList
          data={groupInfo.members}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const isAdmin = item._id === groupInfo.admin._id;
            const isCoAdmin = groupInfo.coAdmins.some(admin => admin._id === item._id);
            const currentUser = item._id === user._id;
            
            return (
              <View style={styles.memberItem}>
                <Image 
                  source={{ uri: item.avt || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name) }} 
                  style={styles.memberAvatar} 
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {item.name} {currentUser ? '(You)' : ''}
                  </Text>
                  {isAdmin && (
                    <Text style={styles.adminBadge}>Admin</Text>
                  )}
                  {isCoAdmin && (
                    <Text style={styles.coAdminBadge}>Co-Admin</Text>
                  )}
                </View>
                
                {(userPermissions.isAdmin || userPermissions.isCoAdmin) && !currentUser && (
                  <TouchableOpacity
                    style={styles.memberActionButton}
                    onPress={() => {
                      const buttons: Array<any> = [
                        {
                          text: 'Cancel',
                          style: 'cancel' as 'cancel',
                        }
                      ];
                      
                      if (userPermissions.isAdmin && !isAdmin && !isCoAdmin) {
                        buttons.push({
                          text: 'Promote to Co-Admin',
                          onPress: () => promoteToCoAdmin(item._id),
                          style: 'default' as 'default',
                        });
                      }
                      
                      if (userPermissions.isAdmin && isCoAdmin) {
                        buttons.push({
                          text: 'Remove from Co-Admin',
                          onPress: () => demoteFromCoAdmin(item._id),
                          style: 'default' as 'default',
                        });
                      }
                      
                      if ((userPermissions.isAdmin && !isAdmin) || 
                          (userPermissions.isCoAdmin && !isAdmin && !isCoAdmin)) {
                        buttons.push({
                          text: 'Remove from Group',
                          style: 'destructive' as 'destructive',
                          onPress: () => removeMember(item._id),
                        });
                      }
                      
                      Alert.alert(
                        'Member Actions',
                        `Select an action for ${item.name}`,
                        buttons
                      );
                    }}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#666" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </View>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Members</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAddMemberModal(false)}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor="#999"
            />
            
            {loadingContacts ? (
              <ActivityIndicator style={styles.loader} size="large" color="#007BFF" />
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => addMember(item._id)}
                  >
                    <Image 
                      source={{ uri: item.avt || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name) }} 
                      style={styles.contactAvatar} 
                    />
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.name}</Text>
                      {item.email && (
                        <Text style={styles.contactEmail}>{item.email}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => addMember(item._id)}
                    >
                      <Ionicons name="add" size={24} color="#FFF" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No contacts available to add</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Group Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Group</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowEditModal(false)}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            {renderEditAvatar()}
            
            <TextInput
              style={styles.input}
              placeholder="Group Name"
              value={editedName}
              onChangeText={setEditedName}
              placeholderTextColor="#999"
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Group Description (Optional)"
              value={editedDescription}
              onChangeText={setEditedDescription}
              multiline
              placeholderTextColor="#999"
            />
            
            <TouchableOpacity
              style={styles.updateButton}
              onPress={updateGroupSettings}
              disabled={updatingGroup}
            >
              {updatingGroup ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.updateButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRightPlaceholder: {
    width: 40,
  },
  groupInfoContainer: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  groupAvatarContainer: {
    marginBottom: 16,
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007BFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupImage: {
    width: '100%',
    height: '100%',
  },
  groupInitial: {
    fontSize: 36,
    color: '#FFF',
    fontWeight: 'bold',
  },
  groupName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  groupDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  memberCount: {
    fontSize: 14,
    color: '#999',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
  },
  editButtonText: {
    color: '#0084ff',
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  actionButton: {
    alignItems: 'center',
  },
  actionButtonText: {
    marginTop: 8,
    color: '#007BFF',
  },
  leaveText: {
    color: '#FF3B30',
  },
  membersSection: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  memberInfo: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  adminBadge: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
    fontWeight: 'bold',
  },
  coAdminBadge: {
    fontSize: 12,
    color: '#5AC8FA',
    marginTop: 4,
    fontWeight: 'bold',
  },
  memberActionButton: {
    padding: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  updateButton: {
    backgroundColor: '#007BFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  updateButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  editAvatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f2f5',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  editAvatar: {
    width: '100%',
    height: '100%',
  },
  editAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarText: {
    color: '#999',
    fontSize: 12,
    marginTop: 8,
  },
  uploadProgressText: {
    color: '#0084ff',
    marginTop: 8,
  },
  loader: {
    marginTop: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  contactInfo: {
    marginLeft: 12,
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
  },
  contactEmail: {
    color: '#666',
    marginTop: 4,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#007BFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});

export default GroupDetailsScreen; 