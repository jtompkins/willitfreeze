import jsonp from 'jsonp';
import format from 'format';

import * as Constants from './constants';
import StorageService from './storageService';

class LocationService {
	constructor(bingKey) {
		this.bingKey = bingKey;
	}

	getGeolocation() {
		let storage = new StorageService(3);
		let saved = storage.get(Constants.SAVED_GEOLOC_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				let loc = { log: location.coords.longitude, lat: location.coords.latitude };

				storage.set(Constants.SAVED_GEOLOC_KEY, loc);

				resolve(loc);
			}, reject, null);
		});
	}

	getAddress(location) {
		let storage = new StorageService(3);
		let saved = storage.get(Constants.SAVED_ADDRESS_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			let url = format(Constants.BING_URL, location.lat, location.log, this.bingKey);

			jsonp(url, {param: 'jsonp'}, (err, data) => {
				if (err) reject(err);

				let set = data.resourceSets;

				if (!set || set.length < 1)
					resolve(null);

				let resources = set[0].resources;

				if (!resources || resources.length < 1)
					resolve(null);

				let address = resources[0].address;

				if (!address)
					resolve(null);

				storage.set(Constants.SAVED_ADDRESS_KEY, address);

				resolve(address);
			});
		});
	}
}

export default LocationService;