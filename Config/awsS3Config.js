'use strict';
var s3BucketCredentials = {
    "bucket": "samplebucketname",
    "accessKeyId": "accesskeyId",
    "secretAccessKey": "secretkey",
    //"s3URL": "https://s3.amazonaws.com/booholapp/",
    "s3URL": "http://bucketname.s3.amazonaws.com",
    "folder": {
        "profilePicture": "profilePicture",
        "thumb": "thumb",
        "customer":"customer",
        "category":"category",
        "jobimages":"jobimages"
    },
    "agentDefaultPicUrl": "http://instamow.s3.amazonaws.com/agent/profilePicture/default.png",
    "fbUrl": "https://graph.facebook.com/"
};

module.exports = {
    s3BucketCredentials: s3BucketCredentials
};
