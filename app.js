import $ from 'jquery';
import ko from 'knockout';

import * as Constants from 'lib/constants';

import LocationService from 'lib/locationService';
import ForecastService from 'lib/forecastService';
import StorageService from 'lib/storageService';
import PhotoService from 'lib/photoService';

class AppViewModel {
	constructor() {
		this.isBusy = ko.observable(false);

		this.todaysLow = ko.observable(0.0);
		this.tomorrowsLow = ko.observable(0.0);

		this.city = ko.observable('');
		this.photo = ko.observable('');

		this.photoCss = ko.computed(() => {
		    return `url(${this.photo()})`;
		});

		this.load();
	}

	getRandomInt(min, max) {
	  return Math.floor(Math.random() * (max - min)) + min;
	}

	pickRandomPhoto(photos) {
		let index = this.getRandomInt(0, photos.length);

		return photos[index];
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
		let photoService = new PhotoService(Constants.FLICKR_KEY);

		locationService.getGeolocation()
					.then((location) => {
				 		let forecastTask = forecastService.getForecast(location);
				 		let addressTask = locationService.getAddress(location);
				 		let photoTask = photoService.getPhotos(location);

				 		return Promise.all([addressTask, forecastTask, photoTask]);
				 	})
				 	.then((data) => {
				 		let address = data[0];
				 		let forecast = data[1];
				 		let photos = data[2];

				 		if (photos) {
					 		let photo = this.pickRandomPhoto(photos);

					 		if(photo) {
						 		let photoUrl = photoService.getPhotoUrl(photo);

						 		this.photo(photoUrl);
						 	}
				 		}

				 		this.populate(address, forecast);
				 	});
	}
}

$(() => {
	ko.applyBindings(new AppViewModel());
});