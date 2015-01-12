import $ from 'jquery';
import LocationService from './locationService';

const API_KEY = '0f9abf3de31cd1840ae2678512ec1b07';

$(() => {
	let service = new LocationService(API_KEY);

	service.getLocation()
				 .then((location) => service.getForecast(location))
				 .then((forecast) => {
				 		let today = forecast.daily.data[0];
						let tomorrow = forecast.daily.data[1];

						console.log(`Today's low: ${today.temperatureMin}`);
						console.log(`Tomorrow's low: ${tomorrow.temperatureMin}`);
				 	});
});