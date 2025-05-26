import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  FlatList,
  Image,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface User {
  _id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  profileImage?: string;
  avt?: string;
}

interface UserReaction {
  userId: User | string;
  emoji: string;
}

// Updated to support multiple reaction data structures
interface ReactionsMap {
  [userId: string]: string; // Modern format: userId -> emoji
}

interface MessageReactionsProps {
  reactions: ReactionsMap | any;
  currentUserId: string;
  onPress?: (emoji: string) => void;
}

// Common emoji names that might be received from backend
const emojiMap: {[key: string]: string} = {
  "like": "👍",
  "love": "❤️",
  "heart": "❤️", 
  "haha": "😂",
  "wow": "😮", 
  "sad": "😢",
  "angry": "😡",
  "fire": "🔥",
  "clap": "👏",
  "thumbsup": "👍"
};

const normalizeEmoji = (emoji: any): string => {
  if (!emoji) return "👍";
  
  if (typeof emoji === "string") {
    const normalized = emojiMap[emoji.toLowerCase()] || emoji;
    return normalized;
  }
  
  if (typeof emoji === "object" && emoji !== null) {
    if (emoji.emoji && typeof emoji.emoji === "string") {
      return emoji.emoji;
    }
    if (emoji.type && typeof emoji.type === "string") {
      return normalizeEmoji(emoji.type);
    }
  }
  
  return "👍";
};

const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  currentUserId,
  onPress
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Handle different reaction formats and standardize
  const processReactions = () => {
    if (!reactions) return [];
    
    // Process direct userId -> emoji mapping (modern format)
    if (typeof reactions === 'object' && !Array.isArray(reactions)) {
      const emojiCounts: {[emoji: string]: number} = {};
      
      Object.entries(reactions).forEach(([userId, emojiData]) => {
        const normalizedEmoji = normalizeEmoji(emojiData);
        
        if (!normalizedEmoji) return;
        
        if (!emojiCounts[normalizedEmoji]) {
          emojiCounts[normalizedEmoji] = 0;
        }
        
        emojiCounts[normalizedEmoji]++;
      });
      
      return Object.entries(emojiCounts).map(([emoji, count]) => ({ 
        emoji, 
        count,
        users: Object.entries(reactions)
          .filter(([_, reactionEmoji]) => 
            normalizeEmoji(reactionEmoji) === emoji)
          .map(([userId]) => userId)
      }));
    }
    
    // Fallback for unexpected formats
    return [];
  };
  
  const nonEmptyReactions = processReactions().filter(r => r.count > 0);
  
  if (nonEmptyReactions.length === 0) {
    return null;
  }
  
  return (
    <>
      <TouchableOpacity 
        style={styles.reactionsContainer}
        onPress={() => setShowDetails(true)}
      >
        {nonEmptyReactions.map(({ emoji, count }) => (
          <View key={emoji} style={styles.reactionItem}>
            <Text style={styles.emojiText}>{emoji}</Text>
            {count > 1 && <Text style={styles.countText}>{count}</Text>}
          </View>
        ))}
      </TouchableOpacity>
      
      <Modal
        visible={showDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reactions</Text>
              <TouchableOpacity onPress={() => setShowDetails(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.reactionsScroll}>
              {nonEmptyReactions.map(({ emoji, users }) => (
                <View key={emoji} style={styles.reactionSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionEmoji}>{emoji}</Text>
                    <Text style={styles.sectionCount}>{users.length}</Text>
                  </View>
                  
                  {users.map((userId) => (
                    <View key={userId} style={styles.userItem}>
                      <View style={styles.userAvatarPlaceholder}>
                        <Text style={styles.avatarInitials}>
                          {userId === currentUserId ? 'Me' : 'U'}
                        </Text>
                      </View>
                      
                      <Text style={styles.userName}>
                        {userId === currentUserId ? 'You' : 'User'}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  reactionsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 248, 248, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginVertical: 4,
    maxWidth: '80%',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  emojiText: {
    fontSize: 18,
    fontFamily: 'System',
  },
  countText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 2,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '85%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  reactionsScroll: {
    maxHeight: '90%',
  },
  reactionSection: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  sectionCount: {
    fontSize: 14,
    color: '#666',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  userAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitials: {
    color: '#555',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 16,
    color: '#333',
  },
});

export default MessageReactions; 