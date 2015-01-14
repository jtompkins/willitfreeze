import moment from 'moment';

class StorageService {
	constructor(expirationInHours) {
		this.expirationInHours = expirationInHours;
	}

	get(key) {
		if (!key)
			return null;

		let savedString = localStorage.getItem(key);

		if (!savedString)
			return null;

		let savedObj = JSON.parse(savedString);

		let expiredDate = moment().subtract(this.expirationInHours, 'hours');
		let storageDate = moment(savedObj.asOf);

		if (storageDate.isBefore(expiredDate))
			return null;

		return savedObj.data;
	}

	set(key, obj) {
		let data = {asOf: moment(), data: obj};

		localStorage.setItem(key, JSON.stringify(data));
	}
}

export default StorageService;