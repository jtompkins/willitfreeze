import jsonp from 'jsonp';
import format from 'format';

import StorageService from './storageService';

const BING_URL = 'http://dev.virtualearth.net/REST/v1/Locations/%f,%f?includeEntityTypes=Address&output=json&callback=jsonp&key=%s';
const SAVED_GEOLOC_KEY = 'SAVED_GEOLOC';
const SAVED_ADDRESS_KEY = 'SAVED_ADDRESS';

class LocationService {
	constructor(bingKey) {
		this.bingKey = bingKey;
	}

	getGeolocation() {
		let storage = new StorageService(3);
		let saved = storage.get(SAVED_GEOLOC_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				let loc = { log: location.coords.longitude, lat: location.coords.latitude };

				storage.set(SAVED_GEOLOC_KEY, loc);

				resolve(loc);
			}, reject, null);
		});
	}

	getAddress(location) {
		let storage = new StorageService(3);
		let saved = storage.get(SAVED_ADDRESS_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			let url = format(BING_URL, location.lat, location.log, this.bingKey);

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

				storage.set(SAVED_ADDRESS_KEY, address);

				resolve(address);
			});
		});
	}
}

export default LocationService;