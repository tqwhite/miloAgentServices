import axios from 'axios';

// -------------------------------------------------------------------------
// Define initial user fields

const userFields = {
	refId: '',
	username: '',
	password: '',
	first: '',
	last: '',
	emailAdr: '',
	role: '',
};

// -------------------------------------------------------------------------
// Define initial state for the login store

const loginStoreInitObject = {
	loggedInUser: userFields,
	statusMsg: '',
	validUser: false,
};

// -------------------------------------------------------------------------
// Function to reset user state on logout

const logoutUser = (store) => {
	Object.keys(loginStoreInitObject).forEach((name) => (store[name] = ''));
	store.validUser = false;
};

// -------------------------------------------------------------------------
// Function to log state details (for debugging)

const logDetails = (store) => {
	Object.keys(loginStoreInitObject).forEach(
		(name) => name != 'password' && console.log(`${name}=${store[name]}`),
	);
};

// =========================================================================
// Define the login store using Pinia

export const useLoginStore = defineStore('loginStore', {
	// =========================================================================
	// STATE

	state: () => ({ ...loginStoreInitObject }),

	// =========================================================================
	// ACTIONS

	// Actions (methods) of the store
	actions: {
		// Placeholder function (currently empty)
		setByDate: function () {},

		// ------------------------------------------------------------
		// Logout action

		logout: function () {
			// Note: Using console.log temporarily - should be replaced with proper logging
			console.log('Logging out');
			logoutUser(this);
		},

		// ------------------------------------------------------------
		// Login action

		async login() {
			const url = '/api/login';

			try {
				// Send GET request to the login API with username and password
				const response = await axios.get(url, {
					params: {
						username: this.loggedInUser.username,
						password: this.loggedInUser.password,
					},
				});

				// Get user data from response
				const userObject = response.data[0]; // API returns a list

				// Store authentication tokens from headers
				this.authtoken = response.headers?.authtoken;
				this.authclaims = response.headers?.authclaims;
				this.authsecondsexpirationseconds =
					response.headers?.authsecondsexpirationseconds;
				// Check if user is inactive
				if (userObject.inactive) {
					logoutUser(this);
					this.statusMsg = 'Invalid login request';
					return false;
				}

				// Update state with user data
				Object.keys(userObject).forEach((name) => {
					this.loggedInUser[name] = userObject[name];
				});

				this.validUser = true;
				return true;
			} catch (error) {
				// Improved error handling with fallback
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Login failed - network or server error';
				}
				return false;
			}

			return;
		},

		// ------------------------------------------------------------
		// Update user information

		async updateUserInfo(userEditObject) {
			let error;
			let response;

			// -------------------------------------------------------------
			// IMPORTANT:
			// If you add fields here, you need to add them in the mapper/profile-user
			// -------------------------------------------------------------

			// Combine current user data with edited user data
			const saveData = { ...this.userSimpleObject, ...userEditObject.value };

			// If legacy user, adjust roles
			if (saveData.legacy === true) {
				saveData.role = saveData.role || '';
				const tmp = saveData.role.split(',');
				tmp.push('client'); //someday I will move this to the server
				saveData.role = tmp.join(',').replace(/^,/, '');
			}

			// Prepare API request to save user data
			const url = '/api/saveUserData';
			const axiosParms = {
				method: 'post',
				url,
				data: saveData,
				headers: {
					from: 'loginStore.updateUserInfo',
					...this.getAuthTokenProperty,
				},
			};

			// Send API request
			try {
				response = await axios(axiosParms);
			} catch (err) {
				error = err;
			}

			// Handle errors
			if (error) {
				// Improved error handling with fallback
				if (error.response?.data) {
					this.statusMsg = error.response.data;
				} else if (error.message) {
					this.statusMsg = error.message;
				} else {
					this.statusMsg = 'Update failed - network or server error';
				}
				return false;
			}

			const saveReplyRefId = response.data[0].refID;

			if (saveReplyRefId == this.loggedInUser.refId) {
				// Update state with response data
				Object.keys(userFields).forEach((name) => {
					if (name !== 'legacy') {
						this.loggedInUser[name] = saveData[name];
					}
				});
			}
			this.statusMsg = 'SAVED';

			return true;
		},
	},

	// =========================================================================
	// GETTERS

	getters: {
		// Test getter (appends 'HELLO' to username)
		testing: (state) => state.loggedInUser.username + 'HELLO',

		// ------------------------------------------------------------
		// Returns a simplified user object with fields from userFields

		userDataForEdit: (state) => {
			return Object.keys(userFields).reduce((result, name) => {
				result[name] = state.loggedInUser[name];
				return result;
			}, {});
		},

		// ------------------------------------------------------------
		// Getter for authentication token property

		getAuthTokenProperty: (state) => {
			return { Authorization: `Bearer ${state.authtoken}` };
		},
	},
});
