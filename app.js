import $ from 'jquery';
import ko from 'knockout';

import LocationService from 'lib/locationService';
import ForecastService from 'lib/forecastService';

const FORECAST_KEY = '0f9abf3de31cd1840ae2678512ec1b07';
const BING_KEY = 'Ap_46PGiEwOhWsR44SoFoYUO9_XaMRgXf7TdLHcU_6hWa3Br6hiV3fESATe9GtAh';

class AppViewModel {
	constructor() {
		this.isBusy = ko.observable(false);

		this.todaysLow = ko.observable(0.0);
		this.tomorrowsLow = ko.observable(0.0);

		this.city = ko.observable('');

		this.load();
	}

	load() {
		let locationService = new LocationService(BING_KEY);
		let forecastService = new ForecastService(FORECAST_KEY);

		locationService.getGeolocation()
					.then((location) => {
				 		let forecastTask = forecastService.getForecast(location);
				 		let cityTask = locationService.getAddress(location);

				 		return Promise.all([forecastTask, cityTask]);
				 	})
				 	.then((data) => {
				 		let forecast = data[0];
				 		let address = data[1];

				 		this.city(address.locality);

				 		let today = forecast.daily.data[0];
				 		let tomorrow = forecast.daily.data[1];

				 		this.todaysLow(today.temperatureMin);
				 		this.tomorrowsLow(tomorrow.temperatureMin);
				 	});
	}
}

$(() => {
	ko.applyBindings(new AppViewModel());
});