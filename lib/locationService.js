import jsonp from 'jsonp';
import format from 'format';

const FORECAST_URL = 'https://api.forecast.io/forecast/%s/%f,%f';
const BING_URL = 'http://dev.virtualearth.net/REST/v1/Locations/%f,%f?includeEntityTypes=Address&output=json&callback=jsonp&key=%s';

class LocationService {
	constructor(forecastKey, bingKey) {
		this.forecastKey = forecastKey;
		this.bingKey = bingKey;
	}

	getLocation() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				resolve({ log: location.coords.longitude, lat: location.coords.latitude });
			}, reject, null);
		});
	}

	getCity(location) {
		return new Promise((resolve, reject) => {
			let url = format(BING_URL, location.lat, location.log, this.bingKey);

			jsonp(url, {param: 'jsonp'}, (err, data) => {
				if (err) reject(err);

				var set = data.resourceSets;

				if (!set || set.length < 1)
					resolve('');

				var resources = set[0].resources;

				if (!resources || resources.length < 1)
					resolve('');

				var address = resources[0].address;

				if (!address)
					resolve('');

				resolve(address.locality);
			});
		})
	}

	getForecast(location) {
		return new Promise((resolve, reject) => {
			let url = format(FORECAST_URL, this.forecastKey, location.lat, location.log);

			jsonp(url, null, (err, data) => {
				err ? reject(err) : resolve(data);
			});
		});
	}
}

export default LocationService;