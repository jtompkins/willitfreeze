import jsonp from 'jsonp';
import format from 'format';

import StorageService from './storageService';

const FORECAST_URL = 'https://api.forecast.io/forecast/%s/%f,%f';
const SAVED_FORECAST_KEY = 'SAVED_FORECAST_KEY';

class ForecastService {
	constructor(forecastKey) {
		this.forecastKey = forecastKey;
	}

	getForecast(location) {
		let storage = new StorageService(3);
		let saved = storage.get(SAVED_FORECAST_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			let url = format(FORECAST_URL, this.forecastKey, location.lat, location.log);

			jsonp(url, null, (err, data) => {
				if (err)
					reject(err);

				storage.set(SAVED_FORECAST_KEY, data);

				resolve(data);
			});
		});
	}
}

export default ForecastService;