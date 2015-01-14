import jsonp from 'jsonp';
import format from 'format';

import * as Constants from './constants';

class ForecastService {
	constructor(forecastKey) {
		this.forecastKey = forecastKey;
	}

	getForecast(location) {
		return new Promise((resolve, reject) => {
			let url = format(Constants.FORECAST_URL, this.forecastKey, location.lat, location.log);

			jsonp(url, null, (err, data) => {
				err ? reject(err) : resolve(data);
			});
		});
	}
}

export default ForecastService;