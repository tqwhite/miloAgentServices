<script setup>
	import { useLoginStore } from '@/stores/loginStore';
	const LoginStore = useLoginStore();

	const router = useRouter();

	if (router?.currentRoute.value.query.logout) {
		LoginStore.logout();
	}
</script>

<template>

	<validUserOnly />
  <v-app>

    <generalNavSub />
    <v-main>
	<form_profile />
	</v-main>
	</v-app>
</template>

<style scoped>
	.companyName {
		/*when it was .v-app-bar, it extended to cover the navigation */
		background: #5db1f2;
	}

	.v-toolbar-title {
		text-align: center;
		margin: 0px;
		color: #fff; /* White text color for readability */
		font-family: 'Roboto', sans-serif; /* Roboto is Vuetify's default font */
		margin-inline-start: 0 !important; /* Override the inline-start margin */
	}
</style>
