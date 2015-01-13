import jsonp from 'jsonp';
import format from 'format';

const BING_URL = 'http://dev.virtualearth.net/REST/v1/Locations/%f,%f?includeEntityTypes=Address&output=json&callback=jsonp&key=%s';

class LocationService {
	constructor(bingKey) {
		this.bingKey = bingKey;
	}

	getGeolocation() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				resolve({ log: location.coords.longitude, lat: location.coords.latitude });
			}, reject, null);
		});
	}

	getAddress(location) {
		return new Promise((resolve, reject) => {
			let url = format(BING_URL, location.lat, location.log, this.bingKey);

			jsonp(url, {param: 'jsonp'}, (err, data) => {
				if (err) reject(err);

				var set = data.resourceSets;

				if (!set || set.length < 1)
					resolve(null);

				var resources = set[0].resources;

				if (!resources || resources.length < 1)
					resolve(null);

				var address = resources[0].address;

				if (!address)
					resolve(null);

				resolve(address);
			});
		})
	}
}

export default LocationService;