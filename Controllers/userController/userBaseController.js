/**
 * Created by Navit on 15/11/16.
 */
var Service = require('../../Services');
var UniversalFunctions = require('../../Utils/UniversalFunctions');
var async = require('async');
var UploadManager = require('../../Lib/uploadManager');
var TokenManager = require('../../Lib/TokenManager');
var CodeGenerator = require('../../Lib/CodeGenerator');
var ERROR = UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR;
var _ = require('underscore');

var createUser = function (payloadData,callback) {
    console.log('payload:', payloadData);
    var accessToken = null;
    var uniqueCode = null;
    var dataToSave = payloadData;
    console.log('payload Data:', payloadData);
    if (dataToSave.password)
        dataToSave.password = UniversalFunctions.CryptData(dataToSave.password);
    dataToSave.sortName = payloadData.userName.toUpperCase();
    var customerData = null;
    var dataToUpdate = {};
    var appVersion = null;
    async.series([
        function (cb) {
            if (payloadData.facebookId) {
                var query={
                    $or: [{phoneNumber: payloadData.phoneNumber},{facebookId: payloadData.facebookId}]
                }
                Service.UserService.getUser(query, {}, {lean: true}, function (error, data) {
                    if (error) {
                        cb(error);
                    } else {
                        if (data && data.length > 0) {
                            if (data[0].phoneVerified == true) {
                                cb(ERROR.USER_ALREADY_REGISTERED);
                            }
                            else {
                                Service.UserService.deleteUser({_id: data[0]._id}, function (err, updatedData) {
                                    if (err) cb(err)
                                    else cb(null);
                                });
                            }
                        } else {
                            cb(null);
                        }
                    }
                });
            }
            else {
                var query = {
                    $or: [{phoneNumber: payloadData.phoneNumber}]
                };
                Service.UserService.getUser(query, {}, {lean: true}, function (error, data) {
                    if (error) {
                        cb(error);
                    } else {
                        if (data && data.length > 0) {
                            if (data[0].phoneVerified == true) {
                                cb(ERROR.USER_ALREADY_REGISTERED)
                            }
                            else {
                                Service.UserService.deleteUser({_id: data[0]._id}, function (err, updatedData) {
                                    if (err) cb(err)
                                    else cb(null);
                                })
                            }
                        } else {
                            cb(null);
                        }
                    }
                });
            }

        },
        function (cb) {
            //Validate for facebookId and password
            if (dataToSave.facebookId) {
                if (dataToSave.password) {
                    cb(ERROR.FACEBOOK_ID_PASSWORD_ERROR);
                } else {
                    cb();
                }
            } else if (!dataToSave.password) {
                cb(ERROR.PASSWORD_REQUIRED);
            } else {
                cb();
            }
        },
        function (cb) {
            //Validate countryCode
            if (dataToSave.countryCode.lastIndexOf('+') == 0) {
                if (!isFinite(dataToSave.countryCode.substr(1))) {
                    cb(ERROR.INVALID_COUNTRY_CODE);
                }
                else {
                    cb();
                }
            } else {
                cb(ERROR.INVALID_COUNTRY_CODE);
            }
        },
        function (cb) {
            //Validate phone No
            if (dataToSave.phoneNumber && dataToSave.phoneNumber.split('')[0] == 0) {
                cb(ERROR.INVALID_PHONE_NO_FORMAT);
            } else {
                cb();
            }
        },
        function (cb) {
            CodeGenerator.generateUniqueCode(6, UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER, function (err, numberObj) {
                if (err) {
                    cb(err);
                } else {
                    if (!numberObj || numberObj.number == null) {
                        cb(ERROR.UNIQUE_CODE_LIMIT_REACHED);
                    } else {
                        uniqueCode = numberObj.number;
                        cb();
                    }
                }
            })
        },
        function (cb) {
            //Insert Into DB
            dataToSave.OTPCode = uniqueCode;
            dataToSave.phoneNumber = payloadData.phoneNumber;
            dataToSave.registrationDate = new Date().toISOString();
            Service.UserService.createUser(dataToSave, function (err, customerDataFromDB) {
                console.log('hello', err, customerDataFromDB)
                if (err) {
                    if (err.code == 11000 && err.message.indexOf('phoneNumber_1') > -1) {
                        cb(ERROR.PHONE_NO_EXIST);

                    } else if(err.code == 11000 && ((err.message.indexOf('userName_1') > -1)|| (err.message.indexOf('sortName_1') > -1))){
                        cb(ERROR.USERNAME_EXIST);
                    }
                    else {
                        cb(err)
                    }
                } else {
                    customerData = customerDataFromDB;
                    cb();
                }
            })
        },
        // function (cb) {
        //     //Send SMS to User
        //     if (customerData) {
        //         NotificationManager.sendSMSToUser(uniqueCode, dataToSave.countryCode, dataToSave.mobileNo, function (err, data) {
        //             cb();
        //         })
        //     } else {
        //         cb(ERROR.IMP_ERROR)
        //     }
        //
        // },
        function (cb) {
            //Set Access Token
            if (customerData) {
                var tokenData = {
                    id: customerData._id,
                    type: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER
                };
                TokenManager.setToken(tokenData, function (err, output) {
                    if (err) {
                        cb(err);
                    } else {
                        accessToken = output && output.accessToken || null;
                        cb();
                    }
                })
            } else {
                cb(ERROR.IMP_ERROR)
            }
        },
        function (cb) {
            appVersion = {
                latestIOSVersion: 100,
                latestAndroidVersion: 100,
                criticalAndroidVersion: 100,
                criticalIOSVersion: 100
            }
            cb(null);
        }
    ], function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, {
                accessToken: accessToken,
                otpCode:customerData.OTPCode,
                userDetails: UniversalFunctions.deleteUnnecessaryUserData(customerData),
                appVersion: appVersion
            });
        }
    });
};

var verifyOTP = function (userData,payloadData,callback) {
    var customerData;
    async.series([
        function(cb){
            var query = {
                _id: userData.id
            };
            var options = {lean: true};
            Service.UserService.getUser(query, {}, options, function (err, data) {
                if (err) {
                    cb(err);
                } else {
                    if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        customerData = data && data[0] || null;
                        cb()
                    }
                }
            });
        },
        function (cb) {
            //Check verification code :
            if (payloadData.OTPCode == customerData.OTPCode) {
                cb();
            } else {
                cb(ERROR.INVALID_CODE)
            }
        },
        function (cb) {
            //trying to update customer
            var criteria = {
                _id: userData.id,
                OTPCode: payloadData.OTPCode
            };
            var setQuery = {
                $set: {phoneVerified: true},
                $unset: {OTPCode: 1}
            };
            var options = {new: true};
            console.log('updating>>>', criteria, setQuery, options)
            Service.UserService.updateUser(criteria, setQuery, options, function (err, updatedData) {
                console.log('verify otp callback result', err, updatedData)
                if (err) {
                    cb(err)
                } else {
                    if (!updatedData) {
                        cb(ERROR.INVALID_CODE)
                    } else {
                        cb();
                    }
                }
            });
        }
    ], function (err, result) {
        if (err) {
            callback(err)
        } else {
            callback();
        }

    });
}

var loginUser = function (payloadData,callback) {
    var userFound = false;
    var accessToken = null;
    var successLogin = false;
    var updatedUserDetails = null;
    var appVersion = null;
    async.series([
        function (cb) {
            var criteria = {
                phoneNumber: payloadData.phoneNumber
            };
            //var projection = {
            //    paymentCard: {$elemMatch: {isDefault: true}}
            //};
            var option = {
                lean: true
            };
            Service.UserService.getUser(criteria, {}, option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });

        },
        function (cb) {
            //validations
            if (!userFound) {
                cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.USER_NOT_FOUND);
            } else {
                if (userFound && userFound.password != UniversalFunctions.CryptData(payloadData.password)) {
                    cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.INCORRECT_PASSWORD);
                } else if (userFound.phoneVerified == false) {

                    cb(UniversalFunctions.CONFIG.APP_CONSTANTS.STATUS_MSG.ERROR.NOT_REGISTERED);

                }
                else {
                    successLogin = true;
                    cb();
                }
            }
        },
        function (cb) {
            var criteria = {
                _id: userFound._id
            };
            var setQuery = {
                deviceToken: payloadData.deviceToken,
                deviceType: payloadData.deviceType
            };
            Service.UserService.updateUser(criteria, setQuery, {new: true}, function (err, data) {
                updatedUserDetails = data;
                cb(err, data);
            });

        },
        function(cb){
            var criteria = {
                phoneNumber: payloadData.phoneNumber

            };
            var projection = {
                _id:1,
                deviceToken:1,
                deviceType:1,
                facebookId:1,
                countryCode:1,
                phoneNumber:1,
                first_name:1,
                last_name:1,
                phoneVerified:1
            };
            var option = {
                lean: true
            };
            Service.UserService.getUser(criteria,  projection , option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });
        },
        function (cb) {
            if (successLogin) {
                var tokenData = {
                    id: userFound._id,
                    type: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER,
                };
                TokenManager.setToken(tokenData, function (err, output) {
                    if (err) {
                        cb(err);
                    } else {
                        if (output && output.accessToken) {
                            accessToken = output && output.accessToken;
                            cb();
                        } else {
                            cb(ERROR.IMP_ERROR)
                        }
                    }
                })
            } else {
                cb(ERROR.IMP_ERROR)
            }

        },
        function (cb) {
            appVersion = {
                latestIOSVersion: 100,
                latestAndroidVersion: 100,
                criticalAndroidVersion: 100,
                criticalIOSVersion: 100
            }
            cb(null);
        }
    ], function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, {
                accessToken: accessToken,
                userDetails: UniversalFunctions.deleteUnnecessaryUserData(userFound),
                appVersion: appVersion
            });
        }
    });
};

var loginViaFacebook = function (payloadData,callback) {
    var userFound = false;
    var accessToken = null;
    var successLogin = false;
    var updatedUserDetails = null;
    var appVersion = null;
    async.series([
        function (cb) {
            var criteria = {
                facebookId: payloadData.facebookId
            };
            var projection = {};
            var option = {
                lean: true
            };
            Service.UserService.getUser(criteria, projection, option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });

        },
        function (cb) {
            //validations
            if (!userFound) {
                cb(ERROR.FACEBOOK_ID_NOT_FOUND);
            }
            else if (userFound.phoneVerified == false) {

                cb(ERROR.NOT_REGISTERED);

            }
            else {
                successLogin = true;
                cb();
            }
        },
        function (cb) {
            var criteria = {
                _id: userFound._id
            };
            var setQuery = {
                deviceToken: payloadData.deviceToken,
                deviceType: payloadData.deviceType
            };
            Service.UserService.updateUser(criteria, setQuery, {new: true}, function (err, data) {
                updatedUserDetails = data;
                cb(err, data);
            });

        },
        function(cb){
            var criteria = {
                _id: userFound._id

            };
            var projection = {
                _id:1,
                deviceToken:1,
                deviceType:1,
                facebookId:1,
                countryCode:1,
                phoneNumber:1,
                first_name:1,
                last_name:1,
                phoneVerified:1
            };
            var option = {
                lean: true
            };
            Service.UserService.getUser(criteria,  projection , option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });
        },
        function (cb) {
            if (successLogin) {
                var tokenData = {
                    id: userFound._id,
                    type: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER,
                };
                TokenManager.setToken(tokenData, function (err, output) {
                    if (err) {
                        cb(err);
                    } else {
                        if (output && output.accessToken) {
                            accessToken = output && output.accessToken;
                            cb();
                        } else {
                            cb(ERROR.IMP_ERROR)
                        }
                    }
                })
            } else {
                cb(ERROR.IMP_ERROR)
            }

        },
        function (cb) {
            appVersion = {
                latestIOSVersion: 100,
                latestAndroidVersion: 100,
                criticalAndroidVersion: 100,
                criticalIOSVersion: 100
            }
            cb(null);
        }
    ], function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, {
                accessToken: accessToken,
                userDetails: UniversalFunctions.deleteUnnecessaryUserData(userFound),
                appVersion: appVersion
            });
        }
    });
};

var resendOTP = function (userData,callback) {
    /*
     Create a Unique 4 digit code
     Insert It Into Customer DB
     Send the 4 digit code via SMS
     Send Back Response
     */
    var uniqueCode = null;
    var customerData;
    async.series([
        function(cb){
            var query = {
                _id: userData.id
            };
            var options = {lean: true};
            Service.UserService.getUser(query, {}, options, function (err, data) {
                if (err) {
                    cb(err);
                } else {
                    if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        customerData = data && data[0] || null;
                        if (customerData.phoneVerified == true) {
                            cb(ERROR.PHONE_VERIFICATION_COMPLETE);
                        } else {
                            cb();
                        }
                    }
                }
            });
        },
        function (cb) {
            CodeGenerator.generateUniqueCode(6, UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER, function (err, numberObj) {
                if (err) {
                    cb(err);
                } else {
                    if (!numberObj || numberObj.number == null) {
                        cb(ERROR.UNIQUE_CODE_LIMIT_REACHED);
                    } else {
                        uniqueCode = numberObj.number;
                        cb();
                    }
                }
            })
        },
        function (cb) {
            var criteria = {
                _id: userData.id
            };
            var setQuery = {
                $set: {
                    OTPCode: uniqueCode,
                    codeUpdatedAt: new Date().toISOString()
                }
            };
            var options = {
                lean: true
            };
            Service.UserService.updateUser(criteria, setQuery, options, cb);
        }
    ], function (err, result) {
        callback(err, {OTPCode: uniqueCode});
    })
};

var getOTP = function (payloadData,callback) {
    var query = {
        phoneNumber: payloadData.phoneNumber
    };
    var projection = {
        _id:0,
        OTPCode:1
    };
    var options = {lean: true};
    Service.CustomerService.getCustomer(query, projection, options, function (err, data) {
        if (err) {
            callback(err);
        } else {
            var customerData = data && data[0] || null;
            console.log("customerData-------->>>" + JSON.stringify(customerData))
            if (customerData == null||customerData.OTPCode==undefined) {
                callback(ERROR.OTP_CODE_NOT_FOUND);
            } else {
                callback(null, customerData);
            }
        }
    });
};

var accessTokenLogin = function (userData,payloadData,callback) {
    var appVersion;
    var userdata = {};
    var userFound=null;
    async.series([
        function (cb) {
            var criteria = {
                _id: userData.id
            }
            Service.UserService.getUser(criteria, {}, {}, function (err, data) {
                if (err) cb(err)
                else {
                    if (data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        cb()
                    }
                }

            })
        },
        function (cb) {
            var criteria = {
                _id: userData.id
            };
            var setQuery = {
                deviceToken: payloadData.deviceToken,
                deviceType: payloadData.deviceType
            };
            Service.UserService.updateUser(criteria, setQuery, {new: true}, function (err, data) {
                //      updatedUserDetails = data;
                cb(err, data);
            });

        },
        function (cb) {
            var criteria = {
                _id: userData.id
            }
            Service.UserService.getUser(criteria, {}, {}, function (err, data) {
                if (err) cb(err)
                else {
                    if (data.length == 0) cb(ERROR.USER_NOT_FOUND)
                    else {
                        userdata = data[0];
                        cb(null);
                    }
                }

            })
        },
        function(cb){
            var criteria = {
                _id:  userData.id,

            };
            var projection = {
                _id:1,
                deviceToken:1,
                deviceType:1,
                facebookId:1,
                countryCode:1,
                phoneNumber:1,
                first_name:1,
                last_name:1,
                phoneVerified:1
            };
            var option = {
                lean: true
            };
            Service.UserService.getUser(criteria,  projection , option, function (err, result) {
                if (err) {
                    cb(err)
                } else {
                    userFound = result && result[0] || null;
                    cb();
                }
            });
        },
        function (cb) {
            appVersion = {
                latestIOSVersion: 100,
                latestAndroidVersion: 100,
                criticalAndroidVersion: 100,
                criticalIOSVersion: 100
            };
            cb(null);
        }], function (err, user) {
        if (!err) callback(null, {
            accessToken: userdata.accessToken,
            userDetails: UniversalFunctions.deleteUnnecessaryUserData(userFound),
            appVersion: appVersion
        });
        else callback(err);

    });
}

var logoutCustomer = function (userData, callbackRoute) {
    async.series([
            function (cb) {
                var criteria = {
                    _id: userData.id
                }
                Service.UserService.getUser(criteria, {}, {}, function (err, data) {
                    if (err) cb(err)
                    else {
                        if (data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                        else {
                            cb()
                        }
                    }

                })
            },
            function (callback) {
                var condition = {_id: userData.id};
                var dataToUpdate = {$unset: {accessToken: 1,deviceToken: 1}};
                Service.UserService.updateUser(condition, dataToUpdate, {}, function (err, result) {
                    if (err) {
                        callback(err);
                    } else {
                        console.log("------update customer -----logout -callback----->" + JSON.stringify(result))
                        callback();
                    }
                });
            }
        ],
        function (error, result) {
            if (error) {
                return callbackRoute(error);
            } else {
                return callbackRoute(null);
            }
        });
};

var getProfile = function (userData,callback) {
    var customerData;
    async.series([
        function(cb){
            var query = {
                _id: userData.id
            };
            var projection = {
                __v:0,
                password:0,
                accessToken:0,
                codeUpdatedAt:0
            };
            var options = {lean: true};
            Service.UserService.getUser(query, projection, options, function (err, data) {
                if (err) {
                    cb(err);
                } else {
                    if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                    else {
                        customerData = data && data[0] || null;
                        cb()
                    }
                }
            });
        }

    ], function (err, result) {
        if(err) callback(err)
        else callback(null,{customerData:customerData})
    })
}

var changePassword = function (userData,payloadData,callbackRoute) {
    var oldPassword = UniversalFunctions.CryptData(payloadData.oldPassword);
    var newPassword = UniversalFunctions.CryptData(payloadData.newPassword);
    async.series([
            function(cb){
                var query = {
                    _id: userData.id
                };
                var options = {lean: true};
                Service.UserService.getUser(query, {}, options, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        if(data.length == 0) cb(ERROR.INCORRECT_ACCESSTOKEN)
                        else cb()
                    }
                });
            },
            function (callback) {
                var query = {
                    _id: userData.id
                };
                var projection = {
                    password: 1
                };
                var options = {lean: true};
                Service.UserService.getUser(query, projection, options, function (err, data) {
                    if (err) {
                        callback(err);
                    } else {
                        var customerData = data && data[0] || null;
                        console.log("customerData-------->>>" + JSON.stringify(customerData))
                        if (customerData == null) {
                            callback(ERROR.NOT_FOUND);
                        } else {
                            if (data[0].password == oldPassword && data[0].password != newPassword) {
                                callback(null);
                            }
                            else if (data[0].password != oldPassword) {
                                callback(ERROR.WRONG_PASSWORD)
                            }
                            else if (data[0].password == newPassword) {
                                callback(ERROR.NOT_UPDATE)
                            }
                        }
                    }
                });
            },
            function (callback) {
                var dataToUpdate = {$set: {'password': newPassword}};
                var condition = {_id: userData.id};
                Service.UserService.updateUser(condition, dataToUpdate, {}, function (err, user) {
                    console.log("customerData-------->>>" + JSON.stringify(user));
                    if (err) {
                        callback(err);
                    } else {
                        if (!user || user.length == 0) {
                            callback(ERROR.NOT_FOUND);
                        }
                        else {
                            callback(null);
                        }
                    }
                });
            }
        ],
        function (error, result) {
            if (error) {
                return callbackRoute(error);
            } else {
                return callbackRoute(null);
            }
        });
}

var forgetPassword = function (payloadData,callback) {
    var dataFound = null;
    var code;
    var forgotDataEntry;
    async.series([
            function (cb) {
                var query = {
                    phoneNumber: payloadData.phoneNumber
                };
                Service.UserService.getUser(query, {
                    _id: 1,
                    phoneNumber: 1,
                    phoneVerified: 1,
                    countryCode: 1
                }, {}, function (err, data) {
                    if (err) {
                        cb(ERROR.PASSWORD_CHANGE_REQUEST_INVALID);
                    } else {
                        dataFound = data && data[0] || null;
                        if (dataFound == null) {
                            cb(ERROR.USER_NOT_REGISTERED);
                        } else {
                            if (dataFound.phoneVerified == false) {
                                cb(ERROR.PHONE_VERIFICATION);
                            } else {
                                cb();
                            }

                        }
                    }
                });
            },
            function (cb) {
                CodeGenerator.generateUniqueCode(6, UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER, function (err, numberObj) {
                    if (err) {
                        cb(err);
                    } else {
                        if (!numberObj || numberObj.number == null) {
                            cb(ERROR.UNIQUE_CODE_LIMIT_REACHED);
                        } else {
                            code = numberObj.number;
                            cb();
                        }
                    }
                })
            },
            function (cb) {
                var dataToUpdate = {
                    code: code
                };
                var query = {
                    _id: dataFound._id
                };
                Service.UserService.updateUser(query, dataToUpdate, {}, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        cb();
                    }
                });
            },
            function (cb) {
                console.log("code------>>" + code)
                Service.ForgetPasswordService.getForgetPasswordRequest({customerID: dataFound._id}, {
                    _id: 1,
                    isChanged: 1
                }, {lean: 1}, function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        forgotDataEntry = data && data[0] || null;
                        console.log("@@@@@@@@@@@@@@@@@@@@@@@@",forgotDataEntry)
                        cb();
                    }
                });

            },
            function (cb) {
                var data = {
                    customerID: dataFound._id,
                    requestedAt: Date.now(),
                    userType: UniversalFunctions.CONFIG.APP_CONSTANTS.DATABASE.USER_ROLES.USER
                };
                if (forgotDataEntry == null) {
                    Service.ForgetPasswordService.createForgetPasswordRequest(data, function (err, data) {
                        if (err) {
                            cb(err);
                        } else {
                            console.log("<<<<<<<<<<<<<< created successfully");
                            cb();
                        }
                    });
                } else {
                    if (forgotDataEntry.isChanged == true) {
                        data.isChanged = false;
                    }

                    Service.ForgetPasswordService.updateForgetPasswordRequest({_id: forgotDataEntry._id}, data, {}, cb);
                }
            }
        ],
        function (error, result) {
            if (error) {
                callback(error);
            } else {
                callback(null, {phoneNumber: payloadData.phoneNumber,OTPCode: code});
            }
        });
}

var resetPassword = function (payloadData,callbackRoute) {
    console.log("hello")
    var foundData;
    var customerId = null;
    var data;
    async.series([
        function (callback) {
            var query = {
                phoneNumber: payloadData.phoneNumber
            };
            Service.UserService.getUser(query, {
                _id: 1,
                code: 1,
                phoneVerified: 1
            }, {lean: true}, function (err, result) {
                console.log("@@@@@@@@@@",err,result)
                if (err) {
                    callback(err);
                } else {
                    data = result && result[0] || null;
                    if (data == null) {
                        callback(ERROR.INCORRECT_ID);
                    } else {
                        if (payloadData.OTPCode != data.code) {
                            callback(ERROR.INVALID_CODE);
                        } else {
                            if (data.phoneVerified == false) {
                                callback(ERROR.NOT_VERFIFIED);
                            } else {
                                customerId = data._id;
                                console.log("id-----" + customerId);
                                callback();
                            }
                        }
                    }
                }
            });
        },
        function (callback) {
            var query = {customerID: customerId, isChanged: false};
            Service.ForgetPasswordService.getForgetPasswordRequest(query, {__v: 0}, {
                limit: 1,
                lean: true
            }, function (err, data) {
                if (err) {
                    callback(err);
                } else {
                    foundData = data && data[0] || null;
                    console.log("foundData------" + JSON.stringify(foundData))
                    callback();
                }
            });
        },
        function (callback) {
            if (!UniversalFunctions.isEmpty(foundData)) {
                var minutes = UniversalFunctions.getRange(foundData.requestedAt, UniversalFunctions.getTimestamp(), UniversalFunctions.CONFIG.APP_CONSTANTS.TIME_UNITS.MINUTES);
                if (minutes < 0 || minutes > 24) {
                    return callback(ERROR.PASSWORD_CHANGE_REQUEST_EXPIRE);
                } else {
                    callback();
                }
            }
            else {
                console.log("-----empty founddata----")
                return callback(ERROR.PASSWORD_CHANGE_REQUEST_INVALID);
            }
        },
        function (callback) {
            var dataToUpdate = {password: UniversalFunctions.CryptData(payloadData.password)};
            console.log(dataToUpdate)
            Service.UserService.updateUser({_id: customerId}, dataToUpdate, {}, function (error, result) {
                if (error) {
                    callback(error);
                } else {
                    if (result.n === 0) {
                        callback(ERROR.USER_NOT_FOUND);
                    } else {
                        console.log("-------update pwd-----")
                        callback();
                    }
                }
            });
        },
        function (callback) {
            var dataToUpdate = {
                isChanged: true,
                changedAt: UniversalFunctions.getTimestamp()
            };
            console.log("------update forget collection----")
            Service.ForgetPasswordService.updateForgetPasswordRequest({customerID: customerId}, dataToUpdate, {
                lean: true
            }, callback);
        }
    ], function (error) {
        if (error) {
            callbackRoute(error);
        } else {
            callbackRoute(null);
        }
    })
}

module.exports = {
    createUser:createUser,
    verifyOTP:verifyOTP,
    loginUser:loginUser,
    loginViaFacebook:loginViaFacebook,
    resendOTP:resendOTP,
    getOTP:getOTP,
    accessTokenLogin:accessTokenLogin,
    logoutCustomer:logoutCustomer,
    getProfile:getProfile,
    changePassword:changePassword,
    forgetPassword:forgetPassword,
    resetPassword:resetPassword
};