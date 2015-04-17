//////////////////////////////////////////
// REST URLs
//////////////////////////////////////////

export const BING_URL = 'http://dev.virtualearth.net/REST/v1/Locations/%f,%f?includeEntityTypes=Address&output=json&callback=jsonp&key=%s';
export const FORECAST_URL = 'https://api.forecast.io/forecast/%s/%f,%f';
export const FLICKR_URL = 'https://api.flickr.com/services/rest/?method=flickr.photos.search&api_key=%s&safe_search=1&lat=%f&lon=%f&group_id=%s&format=json&nojsoncallback=1';
export const FLICKR_PHOTO_URL = 'https://farm%s.staticflickr.com/%s/%s_%s_b.jpg';

//////////////////////////////////////////
// Local Storage Keys
//////////////////////////////////////////

export const SAVED_ADDRESS_KEY = 'SAVED_ADDRESS';
export const SAVED_FORECAST_KEY = 'SAVED_FORECAST_KEY';
export const SAVED_PHOTOS_KEY = 'SAVED_PHOTOS_KEY';

//////////////////////////////////////////
// App Settings
//////////////////////////////////////////

export const FORECAST_KEY = '0f9abf3de31cd1840ae2678512ec1b07';
export const BING_KEY = 'AjTv56iHl6iw9QbQCcfx83IexTxihAJibBSSAwVegNSjafjOGHV4jaPpvpE7DXl-';
export const FLICKR_KEY = '66e352ae5a742ff9e843f3d256c0150d';

export const FLICKR_WEATHER_GROUP_ID = '1463451@N25';

export const LOCAL_STORAGE_EXPIRATION = 3; //hours