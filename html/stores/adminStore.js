import axios from 'axios';
import { useLoginStore } from '@/stores/loginStore';

/**
 * ADMIN STORE: Administrative User Management
 * 
 * This store handles administrative operations for user management.
 * It provides actions for creating, editing, and managing users with proper
 * authentication and error handling.
 * 
 * SECURITY FEATURES:
 * - All requests include authentication headers
 * - Password validation following NIST guidelines
 * - No plaintext password storage in frontend state
 * - Comprehensive error handling
 */

// -------------------------------------------------------------------------
// Define initial state for the admin store

const adminStoreInitObject = {
	statusMsg: '',
	loading: false,
	users: [],
	currentUser: null,
};

// =========================================================================
// Define the admin store using Pinia

export const useAdminStore = defineStore('adminStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...adminStoreInitObject }),

	// =========================================================================
	// ACTIONS

	actions: {
		// ------------------------------------------------------------
		// Clear status messages

		clearStatus() {
			this.statusMsg = '';
		},

		// ------------------------------------------------------------
		// Create new user (admin function)

		async createUser(userData) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();
				
				// Validate required fields
				const requiredFields = ['username', 'password', 'first', 'last', 'emailAdr'];
				const missingFields = requiredFields.filter(field => !userData[field]?.trim());
				
				if (missingFields.length > 0) {
					this.statusMsg = `Missing required fields: ${missingFields.join(', ')}`;
					return false;
				}

				// Validate password strength (basic client-side check)
				if (userData.password.length < 12) {
					this.statusMsg = 'Password must be at least 12 characters long';
					return false;
				}

				// Send request to admin user creation endpoint
				const response = await axios.post('/api/adminCreateUser', userData, {
					headers: {
						'Content-Type': 'application/json',
						...loginStore.getAuthTokenProperty,
					},
				});

				// Handle successful user creation
				const createdUser = response.data[0]; // API returns array
				
				if (createdUser?.user) {
					this.statusMsg = `User "${userData.username}" created successfully`;
					
					// Store the created user data for form updates
					this.currentUser = createdUser.user;
					
					// Add to local users list if we have one
					if (this.users && Array.isArray(this.users)) {
						this.users.push(createdUser.user);
					}
					
					return { success: true, user: createdUser.user };
				} else {
					this.statusMsg = 'User creation succeeded but response format unexpected';
					return { success: false };
				}

			} catch (error) {
				// Handle different error types
				if (error.response?.data) {
					// Check for specific duplicate username error
					const errorMsg = error.response.data.toString();
					if (errorMsg.toLowerCase().includes('username already exists') || 
						errorMsg.toLowerCase().includes('duplicate') ||
						errorMsg.toLowerCase().includes('unique constraint')) {
						this.statusMsg = `Username "${userData.username}" is already taken. Please choose a different username.`;
					} else {
						this.statusMsg = errorMsg;
					}
				} else if (error.response?.status === 401) {
					this.statusMsg = 'Unauthorized: Admin access required';
				} else if (error.response?.status === 400) {
					this.statusMsg = 'Invalid user data provided';
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'User creation failed - network or server error';
				}
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Update existing user (admin function)

		async updateUser(userData) {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();
				
				// Validate required fields for update
				const requiredFields = ['username', 'first', 'last', 'emailAdr'];
				const missingFields = requiredFields.filter(field => !userData[field]?.trim());
				
				if (missingFields.length > 0) {
					this.statusMsg = `Missing required fields: ${missingFields.join(', ')}`;
					return false;
				}

				// If password is provided, validate it
				if (userData.password && userData.password.length < 12) {
					this.statusMsg = 'Password must be at least 12 characters long';
					return false;
				}

				// Use admin update endpoint for updates
				const response = await axios.post('/api/adminUpdateUser', userData, {
					headers: {
						'Content-Type': 'application/json',
						...loginStore.getAuthTokenProperty,
					},
				});

				// Handle successful user update
				const updatedUser = response.data[0]; // API returns array
				
				if (updatedUser?.user) {
					this.statusMsg = `User "${userData.username}" updated successfully`;
					
					// Update the current user data for form updates
					this.currentUser = updatedUser.user;
					
					// Update in local users list if we have one
					if (this.users && Array.isArray(this.users)) {
						const userIndex = this.users.findIndex(u => u.refId === userData.refId);
						if (userIndex >= 0) {
							this.users[userIndex] = updatedUser.user;
						}
					}
					
					return { success: true, user: updatedUser.user };
				} else {
					this.statusMsg = 'User update failed - unexpected response';
					return { success: false };
				}

			} catch (error) {
				// Handle different error types
				if (error.response?.data) {
					// Check for specific duplicate username error
					const errorMsg = error.response.data.toString();
					if (errorMsg.toLowerCase().includes('username already exists') || 
						errorMsg.toLowerCase().includes('duplicate') ||
						errorMsg.toLowerCase().includes('unique constraint')) {
						this.statusMsg = `Username "${userData.username}" is already taken. Please choose a different username.`;
					} else {
						this.statusMsg = errorMsg;
					}
				} else if (error.response?.status === 401) {
					this.statusMsg = 'Unauthorized: Admin access required';
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'User update failed - network or server error';
				}
				return { success: false };
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// List all users

		async listUsers() {
			this.loading = true;
			this.statusMsg = '';

			try {
				const loginStore = useLoginStore();
				
				// Get user list from admin endpoint
				const response = await axios.get('/api/adminListUsers', {
					headers: {
						...loginStore.getAuthTokenProperty,
					},
				});
				
				// Handle successful user listing
				const result = response.data[0]; // API returns array
				
				if (result?.users && Array.isArray(result.users)) {
					this.users = result.users;
					this.statusMsg = '';
					return true;
				} else {
					this.users = [];
					this.statusMsg = 'No users found';
					return true;
				}

			} catch (error) {
				this.users = [];
				if (error.response?.data) {
					this.statusMsg = error.response.data.toString();
				} else if (error.response?.status === 401) {
					this.statusMsg = 'Unauthorized: Admin access required';
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Failed to load users - network or server error';
				}
				return false;
			} finally {
				this.loading = false;
			}
		},

		// ------------------------------------------------------------
		// Set current user for editing

		setCurrentUser(user) {
			this.currentUser = user ? { ...user } : null;
		},

		// ------------------------------------------------------------
		// Clear current user

		clearCurrentUser() {
			this.currentUser = null;
		},

		// ------------------------------------------------------------
		// Validate password strength (client-side helper)

		validatePassword(password) {
			const errors = [];
			
			if (!password) {
				errors.push('Password is required');
				return { isValid: false, errors };
			}
			
			if (password.length < 12) {
				errors.push('Password must be at least 12 characters long');
			}
			
			if (password.length > 64) {
				errors.push('Password must be no more than 64 characters long');
			}
			
			// Check for common weak passwords (basic check)
			const commonPasswords = [
				'password', '123456', '123456789', 'qwerty', 'abc123', 
				'password123', 'admin', 'letmein', 'welcome', 'monkey'
			];
			
			if (commonPasswords.some(common => password.toLowerCase().includes(common.toLowerCase()))) {
				errors.push('Password contains common words or patterns');
			}
			
			return {
				isValid: errors.length === 0,
				errors
			};
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		// Get users by role
		getUsersByRole: (state) => (role) => {
			return state.users.filter(user => user.role === role);
		},

		// Check if currently loading
		isLoading: (state) => state.loading,

		// Get status message
		getStatusMsg: (state) => state.statusMsg,

		// Get current user being edited
		getCurrentUser: (state) => state.currentUser,
	},
});