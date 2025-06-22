<script setup>
import { useLoginStore } from '@/stores/loginStore';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

// Import tool components
import AddEditUser from '@/components/tools/add-edit-user.vue';

const LoginStore = useLoginStore();
const router = useRouter();

// Handle logout if needed
if (router?.currentRoute.value.query.logout) {
	LoginStore.logout();
}

// Selected tool - default to add-edit-user
const selectedTool = ref('add-edit-user');

// Handle tool selection
const selectTool = (toolName) => {
	selectedTool.value = toolName;
};
</script>

<template>
	<v-app>
		<generalNavSub />
		<v-main style="padding-top: 65px;">
			<v-container fluid class="fill-height">
				<v-row no-gutters class="fill-height">
					<!-- Main content area -->
					<v-col style="flex: 1;">
						<v-card flat class="h-100">
							<!-- Tool selection toolbar -->
							<v-toolbar flat density="compact" color="white">
								<v-spacer></v-spacer>

								<!-- Add/Edit User button -->
								<v-btn 
									variant="outlined" 
									:disabled="selectedTool === 'add-edit-user'"
									@click="selectTool('add-edit-user')"
									prepend-icon="mdi-account-plus"
								>
									ADD/EDIT NEW USER
								</v-btn>
							</v-toolbar>

							<!-- Tool area with conditional rendering -->
							<v-card-text class="d-flex justify-center align-center text-subtitle-1 text-medium-emphasis tool-area">
								<add-edit-user 
									v-if="selectedTool === 'add-edit-user'"
								/>
							</v-card-text>
						</v-card>
					</v-col>
				</v-row>
			</v-container>
		</v-main>
	</v-app>
</template>

<style scoped>
.h-100 {
	height: 100%;
}
:deep(.v-container) {
	padding: 0;
}
.tool-area {
	min-height: calc(100vh - 180px);
}
</style>