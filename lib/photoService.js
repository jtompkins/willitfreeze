import $ from 'jquery';
import format from 'format';

import * as Constants from './constants';

class PhotoService {
	constructor(flickrKey) {
		this.flickrKey = flickrKey;
	}

	getPhotos(location) {
		return new Promise((resolve, reject) => {
			let url = format(Constants.FLICKR_URL, this.flickrKey, location.lat, location.log, Constants.FLICKR_WEATHER_GROUP_ID);

			$.get(url, null, (data, status) => {
				if (!data)
					reject(null);

				let result = data.photos;

				if (!result)
					resolve(null);

				let photos = result.photo;

				if (!photos || photos.length < 1)
					resolve(null);

				resolve(photos);
			});
		});
	}

	getPhotoUrl(photo) {
		let url = format(Constants.FLICKR_PHOTO_URL, photo.farm, photo.server, photo.id, photo.secret);

		return url;
	}
}

export default PhotoService;