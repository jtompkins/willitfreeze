import $ from 'jquery';
import ko from 'knockout';

import * as Constants from 'lib/constants';

import LocationService from 'lib/locationService';
import ForecastService from 'lib/forecastService';
import StorageService from 'lib/storageService';

class AppViewModel {
	constructor() {
		this.isBusy = ko.observable(false);

		this.todaysLow = ko.observable(0.0);
		this.tomorrowsLow = ko.observable(0.0);

		this.city = ko.observable('');

		this.load();
	}

	populate(address, forecast) {
		this.city(address.locality);

 		let today = forecast.daily.data[0];
 		let tomorrow = forecast.daily.data[1];

 		this.todaysLow(today.temperatureMin);
 		this.tomorrowsLow(tomorrow.temperatureMin);
	}

	load() {
		let storageService = new StorageService(Constants.LOCAL_STORAGE_EXPIRATION);

		let savedAddress = storageService.get(Constants.SAVED_ADDRESS_KEY);
		let savedForecast = storageService.get(Constants.SAVED_FORECAST_KEY);

		if (savedAddress && savedForecast) {
			this.populate(savedAddress, savedForecast);

			return;
		}

		let locationService = new LocationService(Constants.BING_KEY);
		let forecastService = new ForecastService(Constants.FORECAST_KEY);

		locationService.getGeolocation()
					.then((location) => {
				 		let forecastTask = forecastService.getForecast(location);
				 		let cityTask = locationService.getAddress(location);

				 		return Promise.all([forecastTask, cityTask]);
				 	})
				 	.then((data) => {
				 		let forecast = data[0];
				 		let address = data[1];

				 		this.populate(address, forecast);
				 	});
	}
}

$(() => {
	ko.applyBindings(new AppViewModel());
});