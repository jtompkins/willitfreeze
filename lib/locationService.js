import jsonp from 'jsonp';

const FORECAST_URL = 'https://api.forecast.io/forecast';

class LocationService {
	constructor(apiKey) {
		this.apiKey = apiKey;
	}

	getLocation() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition((location) => {
				resolve({ log: location.coords.longitude, lat: location.coords.latitude });
			}, reject, null);
		});
	}

	getForecast(location) {
		return new Promise((resolve, reject) => {
			let url = `${FORECAST_URL}/${this.apiKey}/${location.lat},${location.log}`;

			jsonp(url, null, (err, data) => {
				err ? reject(err) : resolve(data);
			});
		});
	}
}

export default LocationService;