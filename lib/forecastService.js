import jsonp from 'jsonp';
import format from 'format';

import * as Constants from './constants';
import StorageService from './storageService';


class ForecastService {
	constructor(forecastKey) {
		this.forecastKey = forecastKey;
	}

	getForecast(location) {
		let storage = new StorageService(3);
		let saved = storage.get(Constants.SAVED_FORECAST_KEY);

		if (saved)
			return new Promise.resolve(saved);

		return new Promise((resolve, reject) => {
			let url = format(Constants.FORECAST_URL, this.forecastKey, location.lat, location.log);

			jsonp(url, null, (err, data) => {
				if (err)
					reject(err);

				storage.set(Constants.SAVED_FORECAST_KEY, data);

				resolve(data);
			});
		});
	}
}

export default ForecastService;