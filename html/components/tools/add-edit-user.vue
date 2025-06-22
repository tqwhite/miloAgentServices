<script setup>
import { ref, computed, watch } from 'vue';
import { useAdminStore } from '@/stores/adminStore';
import { useLoginStore } from '@/stores/loginStore';
import { useRouter } from 'vue-router';

// Import user list component
import UserList from '@/components/tools/user-list.vue';

const adminStore = useAdminStore();
const loginStore = useLoginStore();
const router = useRouter();

// Selected user for editing
const selectedUser = ref(null);

// Mode control
const isEditMode = ref(false);
const formTitle = computed(() => isEditMode.value ? 'Edit User' : 'Create New User');

// Form data
const userForm = ref({
	refId: '',
	username: '',
	password: '',
	confirmPassword: '',
	first: '',
	last: '',
	emailAdr: '',
	phone: '',
	role: 'user'
});

// Validation errors
const errors = ref({
	username: '',
	password: '',
	confirmPassword: '',
	first: '',
	last: '',
	emailAdr: '',
	phone: '',
	role: ''
});

// Form validation rules
const usernameRules = [
	(value) => {
		if (!value?.trim()) return 'Username is required';
		if (!value.match(/^[a-zA-Z0-9_-]+$/)) return 'Username can only contain letters, numbers, underscore, and hyphen';
		return true;
	},
];

const passwordRules = [
	(value) => {
		if (!isEditMode.value && !value) return 'Password is required for new users';
		if (value && value.length < 12) return 'Password must be at least 12 characters long';
		if (value && value.length > 64) return 'Password must be no more than 64 characters long';
		if (value && userForm.value.confirmPassword && value !== userForm.value.confirmPassword) {
			return 'Password does not match confirmation';
		}
		return true;
	},
];

const confirmPasswordRules = [
	(value) => {
		if (userForm.value.password && value !== userForm.value.password) {
			return 'Password confirmation does not match';
		}
		return true;
	},
];

const nameRules = [
	(value) => {
		if (!value?.trim()) return 'This field is required';
		return true;
	},
];

const emailRules = [
	(value) => {
		if (!value?.trim()) return 'Email address is required';
		if (!value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'Invalid email address format';
		return true;
	},
];

const phoneRules = [
	(value) => {
		if (value && !value.replace(/[^\d]/g, '').match(/^\d{10}$/)) {
			return 'Phone number should be 10 digits';
		}
		return true;
	},
];

// Role options
const roleOptions = [
	{ title: 'User', value: 'user' },
	{ title: 'Admin', value: 'admin' },
	{ title: 'Super Admin', value: 'super' }
];

// Password visibility
const showPassword = ref(false);
const showConfirmPassword = ref(false);

// Form reset
const resetForm = () => {
	userForm.value = {
		refId: '',
		username: '',
		password: '',
		confirmPassword: '',
		first: '',
		last: '',
		emailAdr: '',
		phone: '',
		role: 'user'
	};
	errors.value = {
		username: '',
		password: '',
		confirmPassword: '',
		first: '',
		last: '',
		emailAdr: '',
		phone: '',
		role: ''
	};
	adminStore.clearStatus();
};

// Switch to edit mode (future enhancement)
const switchToEditMode = () => {
	isEditMode.value = true;
	// TODO: Load existing user data
};

// Switch to create mode
const switchToCreateMode = () => {
	isEditMode.value = false;
	resetForm();
};

// Validate individual field
const validateField = (fieldName, rules) => {
	const value = userForm.value[fieldName];
	for (const rule of rules) {
		const result = rule(value);
		if (result !== true) {
			errors.value[fieldName] = result;
			return false;
		}
	}
	errors.value[fieldName] = '';
	return true;
};

// Validate entire form
const validateForm = () => {
	const validations = [
		validateField('username', usernameRules),
		validateField('password', passwordRules),
		validateField('confirmPassword', confirmPasswordRules),
		validateField('first', nameRules),
		validateField('last', nameRules),
		validateField('emailAdr', emailRules),
		validateField('phone', phoneRules),
	];
	
	return validations.every(isValid => isValid);
};

// Submit form
const submitForm = async () => {
	if (!validateForm()) {
		return;
	}

	const { confirmPassword, ...userData } = userForm.value;
	
	// Remove password if empty in edit mode
	if (isEditMode.value && !userData.password) {
		delete userData.password;
	}

	let result;
	if (isEditMode.value) {
		result = await adminStore.updateUser(userData);
		if (result.success && result.user) {
			// Update selected user with latest data
			selectedUser.value = result.user;
			// Refresh the user list
			refreshUserList();
		}
	} else {
		result = await adminStore.createUser(userData);
		if (result.success && result.user) {
			// For new user creation, switch to edit mode with the created user data
			isEditMode.value = true;
			selectedUser.value = result.user;
			// Update form with the created user data (including refId)
			userForm.value.refId = result.user.refId;
			// Keep other form data but clear passwords for security
			userForm.value.password = '';
			userForm.value.confirmPassword = '';
			// Clear all validation errors
			Object.keys(errors.value).forEach(key => {
				errors.value[key] = '';
			});
			// Refresh the user list to show the new user
			refreshUserList();
		}
	}

	// Only clear password fields if operation was successful
	if (result.success && isEditMode.value) {
		// For updates, just clear the password fields
		userForm.value.password = '';
		userForm.value.confirmPassword = '';
		Object.keys(errors.value).forEach(key => {
			errors.value[key] = '';
		});
	}
};

// Watch for password changes to revalidate confirmation
watch(
	() => userForm.value.password,
	() => {
		if (userForm.value.confirmPassword) {
			validateField('confirmPassword', confirmPasswordRules);
		}
	}
);

watch(
	() => userForm.value.confirmPassword,
	() => {
		validateField('confirmPassword', confirmPasswordRules);
	}
);

// Handle user selection from the user list
const handleUserSelected = (user) => {
	selectedUser.value = user;
	if (user) {
		// Switch to edit mode and populate form
		isEditMode.value = true;
		userForm.value = {
			refId: user.refId || '',
			username: user.username || '',
			password: '', // Always start with empty password
			confirmPassword: '',
			first: user.first || '',
			last: user.last || '',
			emailAdr: user.emailAdr || '',
			phone: user.phone || '',
			role: user.role || 'user'
		};
		// Clear any existing errors
		Object.keys(errors.value).forEach(key => {
			errors.value[key] = '';
		});
		// Clear admin store status
		adminStore.clearStatus();
	}
};

// Force refresh of user list after creation/update
const userListKey = ref(0);
const refreshUserList = () => {
	userListKey.value++;
};
</script>

<template>
	<v-container fluid class="user-management-container">
		<v-row no-gutters class="fill-height">
			<!-- User List Sidebar -->
			<v-col cols="auto" class="sidebar-column">
				<user-list 
					:key="userListKey"
					:selected-user-id="selectedUser?.refId"
					@user-selected="handleUserSelected"
				/>
			</v-col>

			<!-- User Form Area -->
			<v-col class="form-column">
				<v-card class="user-form-card" elevation="2">
					<v-card-title class="text-h5 d-flex align-center">
						<v-icon class="mr-2">{{ isEditMode ? 'mdi-account-edit' : 'mdi-account-plus' }}</v-icon>
						{{ formTitle }}
					</v-card-title>

					<!-- Mode Toggle Buttons -->
					<v-card-subtitle class="pb-2">
						<v-btn-toggle
							:model-value="isEditMode ? 1 : 0"
							mandatory
							variant="outlined"
							density="compact"
						>
							<v-btn @click="switchToCreateMode" size="small">
								<v-icon>mdi-account-plus</v-icon>
								Create New
							</v-btn>
							<v-btn @click="switchToEditMode" size="small" disabled>
								<v-icon>mdi-account-edit</v-icon>
								Edit Existing
							</v-btn>
						</v-btn-toggle>
					</v-card-subtitle>

					<!-- Status Messages -->
					<v-alert
						v-if="adminStore.statusMsg"
						:type="adminStore.statusMsg.includes('successfully') ? 'success' : 'error'"
						class="mb-4"
						dismissible
						@click:close="adminStore.clearStatus()"
					>
						{{ adminStore.statusMsg }}
					</v-alert>

					<!-- User Form -->
					<v-card-text class="form-content">
						<v-form @submit.prevent="submitForm">
						<!-- User ID (read-only, only shown in edit mode) -->
						<v-text-field
							v-if="isEditMode && userForm.refId"
							v-model="userForm.refId"
							label="User ID"
							readonly
							prepend-icon="mdi-identifier"
							class="mb-2"
							variant="outlined"
							density="compact"
						/>
						
						<!-- Username -->
						<v-text-field
							v-model="userForm.username"
							:rules="usernameRules"
							:error="!!errors.username"
							:error-messages="errors.username"
							label="Username"
							autocomplete="username"
							prepend-icon="mdi-account-outline"
							class="mb-2"
							:hint="isEditMode ? 'Username can be changed - updates are based on User ID' : ''"
							persistent-hint
						/>

						<!-- Password -->
						<v-text-field
							v-model="userForm.password"
							:rules="passwordRules"
							:error="!!errors.password"
							:error-messages="errors.password"
							:label="isEditMode ? 'New Password (leave blank to keep current)' : 'Password'"
							:type="showPassword ? 'text' : 'password'"
							autocomplete="new-password"
							prepend-icon="mdi-lock-outline"
							:append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
							@click:append-inner="showPassword = !showPassword"
							class="mb-2"
						/>

						<!-- Confirm Password -->
						<v-text-field
							v-if="userForm.password"
							v-model="userForm.confirmPassword"
							:rules="confirmPasswordRules"
							:error="!!errors.confirmPassword"
							:error-messages="errors.confirmPassword"
							label="Confirm Password"
							:type="showConfirmPassword ? 'text' : 'password'"
							autocomplete="new-password"
							prepend-icon="mdi-lock-check-outline"
							:append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
							@click:append-inner="showConfirmPassword = !showConfirmPassword"
							class="mb-2"
						/>

						<!-- First Name -->
						<v-text-field
							v-model="userForm.first"
							:rules="nameRules"
							:error="!!errors.first"
							:error-messages="errors.first"
							label="First Name"
							autocomplete="given-name"
							prepend-icon="mdi-account-details-outline"
							class="mb-2"
						/>

						<!-- Last Name -->
						<v-text-field
							v-model="userForm.last"
							:rules="nameRules"
							:error="!!errors.last"
							:error-messages="errors.last"
							label="Last Name"
							autocomplete="family-name"
							prepend-icon="mdi-account-details-outline"
							class="mb-2"
						/>

						<!-- Email -->
						<v-text-field
							v-model="userForm.emailAdr"
							:rules="emailRules"
							:error="!!errors.emailAdr"
							:error-messages="errors.emailAdr"
							label="Email Address"
							type="email"
							autocomplete="email"
							prepend-icon="mdi-email-outline"
							class="mb-2"
						/>

						<!-- Phone -->
						<v-text-field
							v-model="userForm.phone"
							:rules="phoneRules"
							:error="!!errors.phone"
							:error-messages="errors.phone"
							label="Phone (optional)"
							type="tel"
							autocomplete="tel"
							prepend-icon="mdi-phone-outline"
							class="mb-2"
						/>

						<!-- Role -->
						<v-select
							v-model="userForm.role"
							:items="roleOptions"
							label="Role"
							prepend-icon="mdi-shield-account-outline"
							class="mb-4"
						/>

						<!-- Submit Button -->
						<v-btn
							type="submit"
							color="primary"
							size="large"
							block
							:loading="adminStore.loading"
							:disabled="adminStore.loading"
						>
							<v-icon start>{{ isEditMode ? 'mdi-content-save' : 'mdi-account-plus' }}</v-icon>
							{{ isEditMode ? 'Update User' : 'Create User' }}
						</v-btn>

						<!-- Secondary Actions -->
						<div class="mt-2">
							<v-btn
								v-if="isEditMode"
								variant="outlined"
								size="large"
								block
								@click="switchToCreateMode"
								:disabled="adminStore.loading"
								class="mb-2"
							>
								<v-icon start>mdi-account-plus</v-icon>
								Create Another User
							</v-btn>
							
							<v-btn
								variant="outlined"
								size="large"
								block
								@click="resetForm"
								:disabled="adminStore.loading"
							>
								<v-icon start>mdi-refresh</v-icon>
								{{ isEditMode ? 'Clear Form' : 'Reset Form' }}
							</v-btn>
						</div>
						</v-form>
					</v-card-text>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>

<style scoped>
/* User Management Container */
.user-management-container {
	height: calc(100vh - 200px);
	padding: 0;
	max-width: none;
}

.fill-height {
	height: 100%;
}

.sidebar-column {
	flex: 0 0 320px;
	width: 320px;
	min-width: 320px;
	max-width: 320px;
}

.form-column {
	flex: 1 1 auto;
	min-width: 0;
	margin-left: 16px;
	display: flex;
	flex-direction: column;
}

.user-form-card {
	height: 100%;
	max-height: calc(100vh - 200px);
	display: flex;
	flex-direction: column;
}

.form-content {
	flex: 1 1 auto;
	overflow-y: auto;
	padding: 16px;
}

/* Force Vuetify row to use flexbox properly */
:deep(.v-row) {
	display: flex;
	flex-wrap: nowrap;
	align-items: stretch;
}

:deep(.v-col) {
	flex-basis: auto;
}

/* Component-specific styles */
.v-btn-toggle {
	border-radius: 8px;
}

/* Ensure proper horizontal layout */
.user-management-container .v-row {
	flex-direction: row;
	align-items: stretch;
	height: 100%;
}
</style>