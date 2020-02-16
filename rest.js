/* external modules */
var mongodb = require('mongodb');
var WebSocket = require('ws');

/* own modules */
var lib = require('./lib');
var common = require('./common');

module.exports = function(url, req, rep, query, payload, session) {

    console.log('REST handling ' + req.method + ' ' + url + ' query ' + JSON.stringify(query) + ' payload ' + JSON.stringify(payload) + ' session ' + session);
    switch(url) {

        case '/account':
            if(!common.sessions[session].accountNo) {
                lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;
            }
            switch(req.method) {
                case 'GET':
                    common.accounts.findOne({_id: common.sessions[session].accountNo}, {}, function(err, account) {
                        if(err) {
                            lib.sendJSONWithError(rep, 400, 'No such object'); return;
                        }
                        delete account.password;                
                        lib.sendJSON(rep, account);
                    });
                    break;
                case 'POST':
                    common.accounts.findOne({_id: common.sessions[session].accountNo}, {}, function(err, account) {
                        if(err) {
                            lib.sendJSONWithError(rep, 400, 'No such object'); return;
                        }                
                        if(isNaN(payload.amount) || payload.amount <= 0) {
                            lib.sendJSONWithError(rep, 400, 'Invalid operation data');
                        } else if(account.balance - payload.amount < account.limit) {
                            lib.sendJSONWithError(rep, 400, 'Limit exceeded');
                        } else {
                            common.accounts.find({email: payload.recipient}).toArray(function(err, docs) {
                                if(err || docs.length != 1) {
                                    lib.sendJSONWithError(rep, 400, 'Recipient unknown or ambiguous');
                                    return;
                                }
                                var recipient_id = docs[0]._id;
                                if(recipient_id.equals(account._id)) {
                                    lib.sendJSONWithError(rep, 400, 'Sender and recipient are the same account');
                                    return;
                                }
                                common.accounts.findOneAndUpdate({_id: common.sessions[session].accountNo},
                                    {$set: {balance: account.balance - payload.amount, lastOperation: new Date().getTime()}},
                                    {returnOriginal: false}, function(err, updated) {
                                    if(err) {
                                        lib.sendJSONWithError(rep, 400, 'Update failed'); return;
                                    }
                                    common.accounts.findOneAndUpdate({_id: recipient_id},
                                        {$inc: {balance: payload.amount, lastOperation: new Date().getTime()}},
                                        {returnOriginal: false}, function(err, updated_r) {
                                            if(err) {
                                                console.log('Recipient account balance is not updated');
                                                return;
                                            }
                                            common.history.insertOne({
                                                date: updated.value.lastOperation,
                                                account: common.sessions[session].accountNo,
                                                recipient_id: recipient_id,
                                                amount: payload.amount,
                                                balance: updated.value.balance,
                                                balance_r: updated_r.value.balance,
                                                description: payload.description
                                            });        
                                            // message to recipient
                                            var message = { transfer: {
                                                from: common.sessions[session].accountNo,
                                                amount: payload.amount,
                                                balance: updated_r.value.balance
                                            }};
                                            lib.sendDataToAccount(recipient_id, JSON.stringify(message));
                                        });
                                    delete updated.value.password;
                                    lib.sendJSON(rep, updated.value);    
                                });
                            });
                        }
                    });
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/recipients':
            switch(req.method) {
                case 'GET':
                    common.history.aggregate([
                        {$match:{account: common.sessions[session].accountNo}},
                        {$group:{_id:'$recipient_id'}},
                        {$lookup:{from:'accounts','localField':'_id','foreignField':'_id','as':'recipient'}},
                        {$unwind:'$recipient'},
                        {$addFields:{email:'$recipient.email'}},
                        {$project:{_id:false,recipient:false}},
                        {$sort:{email:1}}
                    ]).toArray(function(err, docs) {
                        lib.sendJSON(rep, docs.map(function(el) { return el.email; }));
                    });
                    break;
                default: lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/history':
            switch(req.method) {
                case 'GET':
                    if(!common.sessions[session].accountNo) {
                        lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                    }
                    var skip = parseInt(query.skip);
                    var limit = parseInt(query.limit);
                    if(isNaN(skip) || isNaN(limit) || skip < 0 || limit <= 0) {
                        lib.sendJSONWithError(rep, 400, 'Skip/limit errornous'); return;    
                        return;
                    }
                    var q = {$or: [{account: common.sessions[session].accountNo},{recipient_id: common.sessions[session].accountNo}]};
                    if(query.filter) {
                        q.description = {$regex: new RegExp(query.filter), $options: 'si'};
                    }
                    common.history.aggregate([
                        {$match:q},
                        {$lookup:{from:'accounts',localField:'account',foreignField:'_id',as:'sender'}},
                        {$unwind:{path:'$sender'}},
                        {$addFields:{email:'$sender.email'}},
                        {$lookup:{from:'accounts',localField:'recipient_id',foreignField:'_id',as:'recipient'}},
                        {$unwind:{path:'$recipient'}},
                        {$addFields:{email_r:'$recipient.email'}},
                        {$addFields:{balance_after:{$cond:{if:{$eq:['$email',common.sessions[session].email]},then:'$balance',else:'$balance_r'}}}},
                        {$project:{account:false,sender:false,recipient:false,balance:false,balance_r:false}},
                        {$sort:{date:-1}},{$skip:skip},{$limit:limit}
                    ]).toArray(function(err, entries) {
                        if(err)
                            lib.sendJSONWithError(rep, 400, 'History retrieving failed');
                        else {
                            lib.sendJSON(rep, entries);
                        }
                    });
                    break;
                case 'DELETE':
                    if(!common.sessions[session].accountNo) {
                        lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                    }
                    common.history.aggregate([
                        {$match:{$or: [{account: common.sessions[session].accountNo},{recipient_id: common.sessions[session].accountNo}]}},
                        {$lookup:{from:'accounts',localField:'account',foreignField:'_id',as:'sender'}},
                        {$unwind:{path:'$sender'}},
                        {$lookup:{from:'accounts',localField:'recipient_id',foreignField:'_id',as:'recipient'}},
                        {$unwind:{path:'$recipient'}},
                        {$count:'count'}
                    ]).toArray(function(err, docs) {
                        if(err || docs.length != 1)
                            lib.sendJSONWithError(rep, 400, 'Cannot count objects in history'); 
                        else
                            lib.sendJSON(rep, docs[0]);
                    });
                    break;
            }
            break;

        case '/login':
            switch(req.method) {
                case 'GET':
                    var whoami = {
                        session: session,
                        accountNo: common.sessions[session].accountNo,
                        email: common.sessions[session].email,
                        type: common.sessions[session].type
                    };
                    lib.sendJSON(rep, whoami);
                    break;
                case 'POST':
                    if(!payload || !payload.email || !payload.password) {
                        lib.sendJSONWithError(rep, 401, 'Invalid credentials');
                        return;
                    }
                    common.accounts.findOne(payload, {}, function(err, account) {
                        if(err || !account) {
                            lib.sendJSONWithError(rep, 401, 'No account found');
                            return;
                            }
                        if(account.status == "refused"){
                            lib.sendJSONWithError(rep, 401, 'Account form has been refused');
                            return;
                            }
                        if(account.status == "awaiting"){
                            lib.sendJSONWithError(rep, 401, 'Account is to be accepted');
                            return;
                            }
                        common.sessions[session].accountNo = account._id;
                        common.sessions[session].email = account.email;
                        common.sessions[session].type = account.type;
                        delete account.password;
                        lib.sendJSON(rep, account);
                    });
                    break;
                case 'DELETE':
                    delete common.sessions[session].accountNo;
                    delete common.sessions[session].email;
                    delete common.sessions[session].type;
                    lib.sendJSON(rep, { session: session });
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

            case '/proposals':
                switch(req.method) {
                    case 'GET':
                        if(!common.sessions[session].accountNo) {
                            lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                        }
                        if(common.sessions[session].type!="employee") {
                            lib.sendJSONWithError(rep, 401, 'You are not authorised'); return;    
                        }
                        var limit = parseInt(query.limit);
                        var q = {$or:[{password:{$regex: new RegExp(query.filter), $options: 'si'}},{email:{$regex: new RegExp(query.filter), $options: 'si'}}]};
                        
                        common.accounts.aggregate([
                            {$match: q},
                            {$sort:{date:-1}},
                            {$limit:limit}
                        ]).toArray(function(err, entries) {
                            if(err)
                                lib.sendJSONWithError(rep, 400, 'Proposals retrieving failed');
                            else {
                                lib.sendJSON(rep, entries);
                            }
                        });
                        break;

                    case 'POST':
                        if(!common.sessions[session].accountNo) {
                            lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                        }
                        if(common.sessions[session].type!="employee") {
                            lib.sendJSONWithError(rep, 401, 'You are not authorised'); return;    
                        }
                        var option = query.option;
                        var q;
                        if (option == "refused" || option == "awaiting" || option == "active") q = {$set: {status: option}};  
                        else if (option =="user" || option == "employee") q = {$set: {type: option}};
                        else { lib.sendJSONWithError(rep, 400, 'Wrong query structure'); return; }
                        common.accounts.findOneAndUpdate({_id: mongodb.ObjectID(payload)},
                                q, {returnOriginal: false}, function(err, updated) {
                                if(err) {
                                        console.log('account is not updated');
                                        return;
                                }
                                if (updated) {
                                    console.log('Account ' + updated.value.email + ' found');
                                    //websocket message broadcast
                                    for(var key in common.sessions) {
                                        if(key != session && common.sessions[key].ws && common.sessions[key].ws.readyState == WebSocket.OPEN ) {
                                            try {
                                                common.sessions[key].ws.send(JSON.stringify({action: 'userTypeChange', text: 'Account ' + updated.value.email + ' has been changed!'}));
                                            } catch(ex) {
                                                console.error('WebSocket error while sending a message');
                                            }
                                        }
                                    }
                                    lib.sendJSON(rep,{session: session});
                                    }
                                });
                    break;

                    case 'DELETE':
                        if(!common.sessions[session].accountNo) {
                            lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                        }
                        if(common.sessions[session].type!="employee") {
                            lib.sendJSONWithError(rep, 401, 'You are not authorised'); return;    
                        }
                        common.accounts.aggregate([
                            {$count:'count'}
                        ]).toArray(function(err, docs) {
                            if(err || docs.length != 1)
                                lib.sendJSONWithError(rep, 400, 'Cannot count objects in proposals'); 
                            else
                                lib.sendJSON(rep, docs[0]);
                        });
                        break;
                }
                break;

            case '/accountForm':
                switch(req.method) {
                    case 'POST':
                        if(!payload || !payload.email || !payload.password) {
                            lib.sendJSONWithError(rep, 401, 'Invalid credentials');
                            return;
                        }
                        common.accounts.findOne(payload, {}, function(err, account) {
                                if(account) {
                                    lib.sendJSONWithError(rep, 401, 'Account already exists');
                                    return;
                                }
                                if(err) console.log("Account wasnt found");
                                common.accounts.insertOne({
                                    date: new Date().getTime(),
                                    email: payload.email,
                                    password: payload.password,
                                    balance: 0,
                                    limit: 0,
                                    type: "user",
                                    status: "awaiting"                                
                                });
                                delete payload.password;
                                lib.sendJSON(rep, payload);        
                        });
                    break;                        
                    default:
                        lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
                    }
                break;
                
            case '/templates':
                switch(req.method) {
                    case 'GET':
                        if(!common.sessions[session].accountNo) {
                            lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                        };
                        common.templates.aggregate([
                            {$match:{account_id: mongodb.ObjectID(common.sessions[session].accountNo)}},
                            {$sort:{email:1}}
                            ]).toArray(function(err, docs) {
                                if(err){lib.sendJSONWithError(rep, 400, 'templates not found');};
                        lib.sendJSON(rep, docs);
                        });
                    break;
                    case 'POST':
                        if(!common.sessions[session].accountNo) {
                            lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                        };
                        if(!payload || !payload.amount || !payload.recipient || !payload.name) {
                            lib.sendJSONWithError(rep, 401, 'Invalid template data');
                            return;
                        }
                        common.accounts.findOne({email: payload.recipient}, {}, function(err, account) {
                            if(!account) {
                                lib.sendJSONWithError(rep, 401, 'Recipient not valid!');
                                return; 
                            }
                            common.templates.findOne({account_id:mongodb.ObjectID(common.sessions[session].accountNo),
                                name:payload.name,
                                recipient:payload.recipient,
                                amount:payload.amount,
                                description:payload.description}, {}, function(err, template) {
                                if(template){
                                    lib.sendJSONWithError(rep, 402, 'This template already exists');
                                    return;
                                }
                                if(err) {
                                    lib.sendJSONWithError(rep, 401, 'Finding template failed');
                                    return;
                                };
                                common.templates.insertOne({
                                    account_id:mongodb.ObjectID(common.sessions[session].accountNo),
                                    name:payload.name,
                                    recipient:payload.recipient,
                                    amount:payload.amount,
                                    description:payload.description
                                                          
                                });
                                lib.sendJSON(rep,payload.name);
                            });
                            if(err) console.log("Error in finding the recipient");        
                          });

                    break;

                    default: lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
                    }
                break;

            default:
            lib.sendJSONWithError(rep, 400, 'Invalid rest endpoint ' + url);
    }
};