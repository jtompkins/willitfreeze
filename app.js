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
		this.hasError = ko.observable(false);

		this.todaysLow = ko.observable(0.0);
		this.tomorrowsLow = ko.observable(0.0);

		this.freeze = ko.observable('');

		this.city = ko.observable('your town');
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

	populate(address, forecast, photos) {
		if (!address || !forecast) {
			this.hasError(true);
			this.isBusy(false);

			return;
		}

		this.city(address.locality);

		let today = forecast.daily.data[0];
		let tomorrow = forecast.daily.data[1];

		let todayText = `${Math.floor(today.temperatureMin)}<sub>&deg;</sub>`;
		let tomorrowText = `${Math.floor(tomorrow.temperatureMin)}<sub>&deg;</sub>`;

		this.todaysLow(todayText);
		this.tomorrowsLow(tomorrowText);

		if (today.temperatureMin < 32 || tomorrow.temperatureMin < 32)
			this.freeze('Yes');
		else
			this.freeze('No');

 		if (photos) {
	 		let photo = this.pickRandomPhoto(photos);

	 		if(photo) {
	 			let photoService = new PhotoService(Constants.FLICKR_KEY);
		 		let photoUrl = photoService.getPhotoUrl(photo);

		 		this.photo(photoUrl);
		 	}
		}
		else
			this.photo('');

 		this.isBusy(false);
	}

	refresh() {
		let storageService = new StorageService(Constants.LOCAL_STORAGE_EXPIRATION);

		storageService.remove(Constants.SAVED_ADDRESS_KEY);
		storageService.remove(Constants.SAVED_FORECAST_KEY);
		storageService.remove(Constants.SAVED_PHOTOS_KEY);

		this.load();
	}

	load() {
		this.hasError(false);
		this.isBusy(true);

		let storageService = new StorageService(Constants.LOCAL_STORAGE_EXPIRATION);

		let savedAddress = storageService.get(Constants.SAVED_ADDRESS_KEY);
		let savedForecast = storageService.get(Constants.SAVED_FORECAST_KEY);
		let savedPhotos = storageService.get(Constants.SAVED_PHOTOS_KEY);

		if (savedAddress && savedForecast && savedPhotos) {
			this.populate(savedAddress, savedForecast, savedPhotos);

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
				 	}, (err) => {
				 		this.isBusy(false);
				 		this.hasError(true);
				 	})
				 	.then((data) => {
				 		let address = data[0];
				 		let forecast = data[1];
				 		let photos = data[2];

				 		if (address)
				 			storageService.set(Constants.SAVED_ADDRESS_KEY, address);

				 		if (forecast)
				 			storageService.set(Constants.SAVED_FORECAST_KEY, forecast);

				 		if (photos)
				 			storageService.set(Constants.SAVED_PHOTOS_KEY, photos);

				 		if (!this.hasError())
					 		this.populate(address, forecast, photos);
				 	}, (err) => {
				 		this.isBusy(false);
				 		this.hasError(true);
				 	});
	}
}

ko.bindingHandlers.fadeVisible = {
    init: function(element, valueAccessor) {
        var value = valueAccessor();
        $(element).toggle(ko.unwrap(value));
    },
    update: function(element, valueAccessor) {
        var value = valueAccessor();
        ko.unwrap(value) ? $(element).fadeIn() : $(element).fadeOut();
    }
};

$(() => {
	ko.applyBindings(new AppViewModel());
});