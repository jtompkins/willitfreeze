import $ from 'jquery';
import LocationService from 'lib/locationService';

const FORECAST_KEY = '0f9abf3de31cd1840ae2678512ec1b07';
const BING_KEY = 'Ap_46PGiEwOhWsR44SoFoYUO9_XaMRgXf7TdLHcU_6hWa3Br6hiV3fESATe9GtAh';

$(() => {
	let service = new LocationService(FORECAST_KEY, BING_KEY);

	service.getLocation()
				.then((location) => {
			 		var forecastTask = service.getForecast(location);
			 		var cityTask = service.getCity(location);

			 		return Promise.all([forecastTask, cityTask]);
			 	})
			 	.then((data) => {
			 		let forecast = data[0];
			 		let city = data[1];

			 		console.log(`Location: ${city}`);

			  	let today = forecast.daily.data[0];
			 		let tomorrow = forecast.daily.data[1];

			 		console.log(`Today's low: ${today.temperatureMin}`);
			 		console.log(`Tomorrow's low: ${tomorrow.temperatureMin}`);
			 	});
});