import jsonp from 'jsonp';
import format from 'format';

const FORECAST_URL = 'https://api.forecast.io/forecast/%s/%f,%f';

class ForecastService {
	constructor(forecastKey) {
		this.forecastKey = forecastKey;
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

export default ForecastService;