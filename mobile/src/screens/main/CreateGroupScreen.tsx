import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { createGroup } from '../../services/groupChatService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../../config/api';
import { AuthContext } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as cloudinaryService from '../../services/cloudinaryService';

interface Contact {
  _id: string;
  name: string;
  avt: string;
  email?: string;
}

// Define the expected structure of the group returned from API
interface Group {
  _id: string;
  name: string;
  description?: string;
  members: string[];
  avatar?: string;
  createdAt?: string;
  admin?: string;
  coAdmins?: string[];
}

const CreateGroupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useContext(AuthContext);
  
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);
  
  // Group image state
  const [groupImage, setGroupImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadContacts();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Sorry, we need camera roll permissions to upload images.');
      }
    }
  };

  const loadContacts = async () => {
    try {
      setLoadingContacts(true);
      
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        console.error("No auth token available");
        Alert.alert("Error", "Authentication required. Please log in again.");
        return;
      }
      
      console.log('CreateGroupScreen: API_URL =', API_URL);
      
      // First attempt with axios
      try {
        console.log('Attempting to load contacts with axios');
        const response = await axios.get(`${API_URL}/api/friendship`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          timeout: 10000, // 10 second timeout
        });
        
        console.log('Axios request successful, response status:', response.status);
        
        const data = response.data;
        processContactsData(data);
        
      } catch (axiosError: any) {
        console.error('Axios request failed:', axiosError.message);
        console.log('Response data if available:', axiosError.response?.data);
        console.log('Response status if available:', axiosError.response?.status);
        
        // Fall back to fetch API as a second attempt
        try {
          console.log('Falling back to fetch API');
          const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          
          const response = await fetch(`${API_URL}/api/friendship`, {
            method: 'GET',
            headers: headers
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          processContactsData(data);
          
        } catch (fetchError) {
          console.error('Fetch API also failed:', fetchError);
          
          // Use hardcoded data for testing if everything else fails
          if (contacts.length === 0) {
            console.log('Using hardcoded test data as last resort');
            setContacts([]);
            Alert.alert(
              'Network Issue', 
              'Could not load contacts. Please check your connection and try again.'
            );
          }
        }
      }
    } catch (error) {
      console.error('Error in loadContacts:', error);
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };
  
  // Helper function to process contacts data
  const processContactsData = (data: any) => {
    console.log('Received data:', Array.isArray(data) ? `${data.length} items` : 'not an array');
    
    if (Array.isArray(data) && data.length > 0) {
      // Transform friendship data
      const contactsList = data
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
      
      console.log(`Transformed ${contactsList.length} contacts from friendships`);
      setContacts(contactsList);
    } else {
      console.log('No valid friendship data found');
      setContacts([]);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingImage(true);
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
            setGroupImage(cloudinaryResponse.secure_url);
            console.log('Group image uploaded:', cloudinaryResponse.secure_url);
          }
        } catch (error) {
          console.error('Failed to upload image:', error);
          Alert.alert('Error', 'Failed to upload image. Please try again.');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
      setUploadingImage(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (selectedContacts.length === 0) {
      Alert.alert('Error', 'Please select at least one contact');
      return;
    }

    try {
      setLoading(true);
      
      const memberIds = selectedContacts.map(contact => contact._id);
      
      // Log what we're trying to create
      console.log(`Creating group "${groupName}" with ${memberIds.length} members`);
      console.log('Member IDs:', JSON.stringify(memberIds));
      
      const groupData = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        members: memberIds,
        avatar: groupImage, // Add the group avatar
      };

      // Use any type for now to avoid TypeScript errors
      const newGroup: any = await createGroup(groupData);
      
      if (newGroup && newGroup._id) {
        console.log('Group created successfully with ID:', newGroup._id);
        Alert.alert('Success', 'Group created successfully');
        
        // Pass the required properties to the navigation
        navigation.navigate('GroupChat', {
          groupId: newGroup._id,
          groupName: newGroup.name,
          // Use optional chaining to handle potential undefined values safely
          // Match the avatarUrl field used in the backend
          groupAvatar: newGroup.avatarUrl || newGroup.avatar || groupImage
        });
      } else {
        throw new Error('Server returned invalid group data');
      }
    } catch (error: any) {
      console.error('Failed to create group:', error);
      
      // Provide a more helpful error message
      const errorMessage = error.message && error.message !== 'Network Error' 
        ? error.message 
        : 'Failed to create group. Please check your connection and try again.';
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectContact = (contact: Contact) => {
    if (selectedContacts.find(c => c._id === contact._id)) {
      setSelectedContacts(selectedContacts.filter(c => c._id !== contact._id));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const filteredContacts = contacts.filter(contact => 
    contact.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderContactItem = ({ item }: { item: Contact }) => {
    const isSelected = selectedContacts.some(contact => contact._id === item._id);
    
    return (
      <TouchableOpacity
        style={[styles.contactItem, isSelected && styles.selectedContactItem]}
        onPress={() => toggleSelectContact(item)}
      >
        <Image
          source={{ uri: item.avt || 'https://via.placeholder.com/50' }}
          style={styles.avatar}
        />
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.email && <Text style={styles.contactEmail}>{item.email}</Text>}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" style={styles.checkIcon} />
        )}
      </TouchableOpacity>
    );
  };

  // Render group avatar or placeholder
  const renderGroupAvatar = () => {
    if (uploadingImage) {
      return (
        <View style={styles.avatarContainer}>
          <View style={styles.uploadProgressContainer}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.uploadProgressText}>{uploadProgress.toFixed(0)}%</Text>
          </View>
        </View>
      );
    }
    
    return (
      <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
        {groupImage ? (
          <Image source={{ uri: groupImage }} style={styles.groupAvatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="camera" size={40} color="#ffffff" />
            <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Group</Text>
        <TouchableOpacity
          onPress={handleCreateGroup}
          disabled={loading}
          style={styles.createButton}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.formContainer}>
        {/* Group avatar section */}
        {renderGroupAvatar()}
        
        <TextInput
          style={styles.input}
          placeholder="Group Name"
          value={groupName}
          onChangeText={setGroupName}
          placeholderTextColor="#888"
        />
        
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Group Description (Optional)"
          value={groupDescription}
          onChangeText={setGroupDescription}
          multiline
          numberOfLines={3}
          placeholderTextColor="#888"
        />
        
        <Text style={styles.sectionTitle}>
          Select Members ({selectedContacts.length} selected)
        </Text>
        
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#888"
        />
      </View>
      
      {loadingContacts ? (
        <ActivityIndicator size="large" color="#0084ff" style={styles.loader} />
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderContactItem}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.contactsList}
          ListEmptyComponent={
            <Text style={styles.emptyMessage}>No contacts found</Text>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#0084ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  formContainer: {
    padding: 16,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f2f5',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  groupAvatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 5,
  },
  uploadProgressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadProgressText: {
    color: '#ffffff',
    marginTop: 5,
    fontSize: 12,
  },
  input: {
    backgroundColor: '#f0f2f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#f0f2f5',
    padding: 12,
    borderRadius: 20,
    marginBottom: 8,
    fontSize: 16,
  },
  contactsList: {
    paddingHorizontal: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  selectedContactItem: {
    backgroundColor: '#f0f8ff',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
  },
  contactEmail: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  checkIcon: {
    marginLeft: 8,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyMessage: {
    textAlign: 'center',
    padding: 20,
    color: '#888',
  },
});

export default CreateGroupScreen; 