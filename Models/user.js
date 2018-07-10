/**
 * Created by Navit on 15/11/16.
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Config = require('../Config');

var user = new Schema({
    first_name: {type: String, trim: true, required: true},
    last_name: {type: String, trim: true, required: true},
    emailId: {type: String, trim: true, required: true},
    accessToken: {type: String, trim: true, index: true, unique: true, sparse: true},
    facebookId:{type: String, trim: true},
    phoneNumber: {type: String, required: true, trim: true, index: true, unique: true, min: 5, max: 15},
    password: {type: String},
    countryCode: {type: String},
    code:{type: String, trim: true},
    OTPCode: {type: String, trim: true},
    phoneVerified: {type: Boolean, default: false},
    deviceType: {type: String, enum: [Config.APP_CONSTANTS.DATABASE.DEVICE_TYPES.ANDROID, Config.APP_CONSTANTS.DATABASE.DEVICE_TYPES.IOS]},
    deviceToken: {type: String},
    registrationDate: {type: Date, default: Date.now},
    codeUpdatedAt: {type: Date, default: Date.now, required: true}
});

module.exports = mongoose.model('user', user);