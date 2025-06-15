<script setup>
	import { useLoginStore } from '@/stores/loginStore';
	const LoginStore = useLoginStore();

	const router = useRouter();

	const username = ref('');
	const password = ref('');

	const usernameRules = [
		(value) => {
			if (value?.length > 0) return true;
			return 'User Name is required.';
		},
	];

	const passwordRules = [
		(value) => {
			if (value?.length > 0) return true;
			return 'Password is required.';
		},
	];

	const submitButton = async () => {
		LoginStore.loggedInUser.username = username.value;
		LoginStore.loggedInUser.password = password.value;

		const tmp = await LoginStore.login()
			.then((validLogin) => {
				if (LoginStore.validUser) {
					router.push('work');
				}
			})
			.catch((err) => {
				LoginStore.statusMsg = err.toString();
			});
	};
</script>

<template>
	<v-container>
		<v-sheet class="pa-12" color="transparent">
			<v-sheet
				class="mx-auto pa-10"
				width="300"
				:elevation="16"
				:rounded="'xl'"
			>
				<div v-if="LoginStore.statusMsg">{{LoginStore.statusMsg}}</div>
				<v-form fast-fail @submit.prevent>
					<v-text-field
						v-model="username"
						:rules="usernameRules"
						label="User Name"
						autocompleset="username"
						@keyup.enter="submitButton"
						autofocus
					>
					</v-text-field>

					<v-text-field
						type="password"
						v-model="password"
						:rules="passwordRules"
						label="Password"
						autocompleset="password"
						@keyup.enter="submitButton"
					>
					</v-text-field>

					<v-btn class="mt-2" @click="submitButton" block>Login</v-btn>
				</v-form>
			</v-sheet>
		</v-sheet>
		<div style="font-size: 8pt; color: #aaa; text-align: center">v1.43</div>
	</v-container>
</template>
