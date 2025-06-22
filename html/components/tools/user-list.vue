<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAdminStore } from '@/stores/adminStore';

const adminStore = useAdminStore();

// Component props
const props = defineProps({
	selectedUserId: {
		type: String,
		default: null
	}
});

// Component emits
const emit = defineEmits(['user-selected']);

// Local state
const searchQuery = ref('');

// Computed properties
const filteredUsers = computed(() => {
	if (!searchQuery.value) return adminStore.users;
	
	const query = searchQuery.value.toLowerCase();
	return adminStore.users.filter(user => 
		user.username?.toLowerCase().includes(query) ||
		user.first?.toLowerCase().includes(query) ||
		user.last?.toLowerCase().includes(query) ||
		user.emailAdr?.toLowerCase().includes(query)
	);
});

const isUserSelected = (userId) => {
	return props.selectedUserId === userId;
};

// Methods
const selectUser = (user) => {
	emit('user-selected', user);
};

const refreshUsers = async () => {
	await adminStore.listUsers();
};

// Lifecycle
onMounted(() => {
	refreshUsers();
});
</script>

<template>
	<v-card class="user-list-sidebar" elevation="2" height="100%">
		<v-card-title class="d-flex align-center pa-4">
			<v-icon class="mr-2">mdi-account-group</v-icon>
			<span>Users</span>
			<v-spacer />
			<v-btn
				icon="mdi-refresh"
				size="small"
				variant="text"
				@click="refreshUsers"
				:loading="adminStore.loading"
				:disabled="adminStore.loading"
			/>
		</v-card-title>

		<!-- Search/Filter -->
		<div class="search-container">
			<v-text-field
				v-model="searchQuery"
				label="Search users..."
				prepend-inner-icon="mdi-magnify"
				clearable
				variant="outlined"
				density="compact"
				hide-details
				class="compact-search"
			/>
		</div>

		<!-- User List -->
		<v-card-text class="pa-0 user-list-container">
			<!-- Loading State -->
			<div v-if="adminStore.loading" class="text-center pa-2">
				<v-progress-circular indeterminate color="primary" size="32" />
				<p class="mt-1 text-body-2">Loading users...</p>
			</div>

			<!-- Empty State -->
			<div v-else-if="!adminStore.users || adminStore.users.length === 0" class="text-center pa-2">
				<v-icon size="32" color="grey-lighten-1">mdi-account-off</v-icon>
				<p class="mt-1 text-body-2 text-grey">No users found</p>
				<v-btn
					size="small"
					variant="outlined"
					color="primary"
					@click="refreshUsers"
					class="mt-1"
				>
					<v-icon start>mdi-refresh</v-icon>
					Refresh
				</v-btn>
			</div>

			<!-- Filtered Empty State -->
			<div v-else-if="filteredUsers.length === 0" class="text-center pa-2">
				<v-icon size="32" color="grey-lighten-1">mdi-account-search</v-icon>
				<p class="mt-1 text-body-2 text-grey">No users match your search</p>
			</div>

			<!-- User List Items -->
			<v-list v-else density="compact" class="pa-0">
				<v-list-item
					v-for="user in filteredUsers"
					:key="user.refId"
					@click="selectUser(user)"
					:active="isUserSelected(user.refId)"
					:class="{ 'bg-primary-lighten-5': isUserSelected(user.refId) }"
					class="user-list-item"
				>
					<template #prepend>
						<v-avatar size="32" :color="isUserSelected(user.refId) ? 'primary' : 'grey-lighten-2'">
							<v-icon>
								{{ user.role === 'admin' ? 'mdi-shield-account' : 
								   user.role === 'super' ? 'mdi-shield-star' : 'mdi-account' }}
							</v-icon>
						</v-avatar>
					</template>

					<v-list-item-title class="font-weight-medium">
						{{ user.username }}
					</v-list-item-title>
					
					<v-list-item-subtitle class="text-caption">
						{{ user.first }} {{ user.last }}
					</v-list-item-subtitle>
					
					<v-list-item-subtitle class="text-caption text-grey">
						{{ user.emailAdr }}
					</v-list-item-subtitle>

					<template #append>
						<v-chip
							:color="user.role === 'admin' ? 'orange' : 
								   user.role === 'super' ? 'red' : 'blue'"
							size="x-small"
							variant="flat"
						>
							{{ user.role }}
						</v-chip>
					</template>
				</v-list-item>
			</v-list>
		</v-card-text>

		<!-- Status Message -->
		<v-card-actions v-if="adminStore.statusMsg && !adminStore.statusMsg.includes('successfully')" class="pa-2">
			<v-alert
				:text="adminStore.statusMsg"
				type="error"
				density="compact"
				class="flex-grow-1"
			/>
		</v-card-actions>
	</v-card>
</template>

<style scoped>
.user-list-sidebar {
	width: 320px;
	height: 100%;
	border-radius: 8px;
	position: relative;
	display: flex;
	flex-direction: column;
}

.user-list-container {
	flex: 1 1 auto;
	max-height: calc(100vh - 300px);
	overflow-y: auto;
	overflow-x: hidden;
	display: flex;
	flex-direction: column;
}

.user-list-item {
	border-bottom: 1px solid rgba(0, 0, 0, 0.05);
	cursor: pointer;
	transition: background-color 0.2s ease;
}

.user-list-item:hover {
	background-color: rgba(0, 0, 0, 0.04);
}

.user-list-item:last-child {
	border-bottom: none;
}

/* Ensure the card and list align properly */
:deep(.v-card) {
	position: relative;
	overflow: hidden;
	height: 100%;
	display: flex;
	flex-direction: column;
}

:deep(.v-card-text) {
	padding: 0;
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
}

:deep(.v-list) {
	flex: 1 1 auto;
	padding: 0;
}

/* Fix card title and actions positioning */
:deep(.v-card-title) {
	flex: 0 0 auto;
}

:deep(.v-card-actions) {
	flex: 0 0 auto;
}

/* Ensure list items start at top */
:deep(.v-list-item) {
	align-self: flex-start;
	width: 100%;
}

/* Search container - minimal spacing */
.search-container {
	padding: 8px 12px 4px 12px;
	flex: 0 0 auto;
}

/* Compact search field */
.compact-search {
	max-height: 36px;
}

:deep(.compact-search .v-field) {
	min-height: 36px;
	height: 36px;
}

:deep(.compact-search .v-field__input) {
	min-height: 36px;
	padding-top: 6px;
	padding-bottom: 6px;
	font-size: 14px;
}

:deep(.compact-search .v-field__prepend-inner) {
	padding-top: 6px;
}

:deep(.compact-search .v-field__append-inner) {
	padding-top: 6px;
}

:deep(.compact-search .v-label) {
	font-size: 14px;
}
</style>