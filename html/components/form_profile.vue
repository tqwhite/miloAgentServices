<script setup>
import { ref, watch } from 'vue';
import { useLoginStore } from '@/stores/loginStore';
const LoginStore = useLoginStore();

const router = useRouter();

if (router?.currentRoute.value.query.logout) {
	LoginStore.logout();
}

const userEditObject = ref(LoginStore.userDataForEdit);
LoginStore.statusMsg=''; //clear this in case it was used previously;

// Reactive error messages for each field
const firstError = ref('');
const lastError = ref('');
const emailAdrError = ref('');
const phoneError = ref('');
const usernameError = ref('');
const passwordError = ref('');
const confirmPasswordError = ref('');

const firstRules = [
	(value) => {
		if (value?.length > 0) return true;
		return 'First Name is required.';
	},
];

const lastRules = [
	(value) => {
		if (value?.length > 0) return true;
		return 'Last Name is required.';
	},
];

const emailAdrRules = [
	(value = '') => {
		if (value.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/))
			return true;
		return 'Incorrect email address format.';
	},
];

const phoneRules = [
	(value = '') => {
		if (!value) {
			return true; //'Phone number is required.'
		}

		if (value.replace(/[^ \d]/g, '').match(/^\d{10}$/)) return true;
		return 'Phone number should be ten digits.';
	},
];

const usernameRules = [
	(value) => {
		if (value?.length > 0) return true;
		return 'User Name is required.';
	},
];

const passwordRules = [
	(value) => {
		if (value !== userEditObject.value.confirmPassword)
			return 'Password does not match Confirm Password';
		return true;
	},
	(value) => {
		if (value?.length > 9) return true;
		return 'Password must be at least 10 characters.';
	},
];

const confirmPasswordRules = [
	(value) => {
		if (value !== userEditObject.value.password)
			return 'Confirm Password does not match Password';
		return true;
	},
];

const validateField = (value, rules, errorRef) => {
	for (const rule of rules) {
		const result = rule(value);
		if (result !== true) {
			errorRef.value = result;
			return false;
		}
	}
	errorRef.value = ''; // Clear error if validation passes
	return true;
};

const submitButton = () => {
	const isFirstValid = validateField(
		userEditObject.value.first,
		firstRules,
		firstError,
	);
	const isLastValid = validateField(
		userEditObject.value.last,
		lastRules,
		lastError,
	);
	const isEmailValid = validateField(
		userEditObject.value.emailAdr,
		emailAdrRules,
		emailAdrError,
	);
	const isPhoneValid = validateField(
		userEditObject.value.phone,
		phoneRules,
		phoneError,
	);
	const isUsernameValid = validateField(
		userEditObject.value.username,
		usernameRules,
		usernameError,
	);
	const isPasswordValid = changePasswordFlag.value
		? validateField(userEditObject.value.password, passwordRules, passwordError)
		: true;
	const isConfirmPasswordValid = changePasswordFlag.value
		? validateField(
				userEditObject.value.confirmPassword,
				confirmPasswordRules,
				confirmPasswordError,
			)
		: true;

	if (
		isFirstValid &&
		isLastValid &&
		isEmailValid &&
		isPhoneValid &&
		isUsernameValid &&
		isPasswordValid &&
		isConfirmPasswordValid
	) {
		LoginStore.updateUserInfo(userEditObject);
	} else {
		console.log('Form validation failed.');
	}
};

let changePasswordFlag = ref(false);
const changePassword = () => {
	changePasswordFlag.value = true;
};


// Watchers to revalidate password and confirmPassword
watch(
	() => userEditObject.value.password,
	() => {
		validateField(userEditObject.value.password, passwordRules, passwordError);
		validateField(
			userEditObject.value.confirmPassword,
			confirmPasswordRules,
			confirmPasswordError,
		);
	},
);

watch(
	() => userEditObject.value.confirmPassword,
	() => {
		validateField(userEditObject.value.password, passwordRules, passwordError);
		validateField(
			userEditObject.value.confirmPassword,
			confirmPasswordRules,
			confirmPasswordError,
		);
	},
);

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

				<v-alert type="info" class="annotation" v-if="LoginStore.legacy">
					Welcome to the new Enviromatic Work Picture Website.
					Please confirm your information and click Save.
					Thank you.
				</v-alert>
				 <v-alert
				 
				  v-if="LoginStore.statusMsg"
					:title="LoginStore.statusMsg"
					type="success"
				  ></v-alert>
				<v-form fast-fail @submit.prevent>
					<input type="hidden" v-model="userEditObject.refId" />
					<input type="hidden" v-model="userEditObject.role" />
			<v-tooltip>
					  <template v-slot:activator="{ props }">
						<v-text-field
						  v-model="userEditObject.first"
						  :rules="firstRules"
						  :error="!!firstError"
						  :error-messages="firstError"
						  label="First Name"
						  autocomplete="given-name"
						  v-bind="props"
						></v-text-field>
					  </template>
					  <template v-slot:default>
						<span>{{ userEditObject.first?userEditObject.first:'no value supplied' }}</span>
					  </template>
					</v-tooltip>
					
					<v-tooltip>
					  <template v-slot:activator="{ props }">
						<v-text-field
						  v-model="userEditObject.last"
						  :rules="lastRules"
						  :error="!!lastError"
						  :error-messages="lastError"
						  label="Last Name"
						  autocomplete="family-name"
						  v-bind="props"
						></v-text-field>
					  </template>
					  <template v-slot:default>
						<span>{{ userEditObject.last?userEditObject.last:'no value supplied' }}</span>
					  </template>
					</v-tooltip>
					
					<v-tooltip>
					  <template v-slot:activator="{ props }">
						<v-text-field
						  v-model="userEditObject.emailAdr"
						  :rules="emailAdrRules"
						  :error="!!emailAdrError"
						  :error-messages="emailAdrError"
						  label="Email Address"
						  autocomplete="email"
						  v-bind="props"
						></v-text-field>
					  </template>
					  <template v-slot:default>
						<span>{{ userEditObject.emailAdr?userEditObject.emailAdr:'no value supplied' }}</span>
					  </template>
					</v-tooltip>
					
					<v-tooltip>
					  <template v-slot:activator="{ props }">
						<v-text-field
						  v-model="userEditObject.phone"
						  :rules="phoneRules"
						  :error="!!phoneError"
						  :error-messages="phoneError"
						  label="Phone"
						  autocomplete="tel"
						  v-bind="props"
						></v-text-field>
					  </template>
					  <template v-slot:default>
						<span>{{ userEditObject.phone?userEditObject.phone:'no value supplied' }}</span>
					  </template>
					</v-tooltip>
					
					<v-tooltip>
					  <template v-slot:activator="{ props }">
						<v-text-field
						  v-model="userEditObject.username"
						  :rules="usernameRules"
						  :error="!!usernameError"
						  :error-messages="usernameError"
						  label="User Name"
						  autocomplete="username"
						  v-bind="props"
						></v-text-field>
					  </template>
					  <template v-slot:default>
						<span>{{ userEditObject.username?userEditObject.username:'no value supplied' }}</span>
					  </template>
					</v-tooltip>
					
					<div v-if="changePasswordFlag">
					  <v-tooltip>
						<template v-slot:activator="{ props }">
						  <v-text-field
						  	type="password"
							v-model="userEditObject.password"
							:rules="passwordRules"
							:error="!!passwordError"
							:error-messages="passwordError"
							label="Password"
							v-bind="props"
						  ></v-text-field>
						</template>
						<template v-slot:default>
						  <span>{{ userEditObject.password?userEditObject.password:'no value supplied' }}</span>
						</template>
					  </v-tooltip>
					
					  <v-tooltip>
						<template v-slot:activator="{ props }">
						  <v-text-field
						  	type="password"
							v-model="userEditObject.confirmPassword"
							:rules="confirmPasswordRules"
							:error="!!confirmPasswordError"
							:error-messages="confirmPasswordError"
							label="Confirm Password"
							v-bind="props"
						  ></v-text-field>
						</template>
						<template v-slot:default>
						  <span>{{ userEditObject.confirmPassword?userEditObject.confirmPassword:'no value supplied' }}</span>
						</template>
					  </v-tooltip>
					</div>

					<div v-else>
						<v-btn class="mt-8 mb-14" @click="changePassword" block
							>Change Password</v-btn
						>
					</div>
					<v-btn class="mt-2" @click="submitButton" block>Save</v-btn>
					<div style="color: #ddd; text-align: center">
						{{LoginStore.refId}}
					</div>
				</v-form>
			</v-sheet>
		</v-sheet>
	</v-container>
</template>