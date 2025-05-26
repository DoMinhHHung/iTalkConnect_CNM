import { StyleSheet } from 'react-native';

export const groupChatStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    padding: 5,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupTextContainer: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  onlineStatus: {
    fontSize: 12,
    color: "#4caf50",
  },
  infoButton: {
    paddingHorizontal: 10,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  roleBadge: {
    fontSize: 12,
    color: '#0084ff',
    fontStyle: 'italic',
  },
}); 