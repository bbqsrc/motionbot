//var Q = require('q'),
//    Db = require('mongodb').Db,
//    MongoClient = require('mongodb').MongoClient,
var irc = require('irc');


String.prototype.startsWith = function(starter) {
    return new RegExp("^" + starter).test(this);
}

Array.prototype.remove = function(item) {
    var i = this.indexOf(item);
    while (i > -1) {
        this.splice(i, 1);
        i = this.indexOf(item);
    }
}

function parseCommand(message, ctrl) {
    var groups = new RegExp("^" + ctrl + "(.+?)(?:\\s(.*))?$").exec(message);
    if (groups == null) { return null }
    return {command: groups[1], args: groups[2] && groups[2].split(" ") || []};
}

function isCommand(message, ctrl, cmd) {
    if (cmd == null) {
        cmd = "";
    }
    return new RegExp("^" + ctrl + cmd).test(message);
}


function Bot(server, name, opts) {
    var client = this.client = new irc.Client(server, name, opts),
        self = this;

    this.debug = true;
    this.ctrl = '!';
    this.stateData = {};
   
    opts.channels.forEach(function(chan) {
        self.onJoin(chan);
    });

    client.addListener('join', function(channel, nick, data) {
        /*
        if (recognise[channel] && recognise[channel].indexOf(data.user + "!" + data.host) > -1) {
            client.send("MODE", channel, "+v", nick);
        }
        */
    });
    
    client.addListener('message', function(user, channel, message) {
        var o;

        if (isCommand(message, self.ctrl)) {
            o = parseCommand(message, self.ctrl) || {};
            
            if (self.debug) {
                console.log(o);
            }

            if (self.commands.all[o.command]) {
                self.commands.all[o.command].call(self, user, channel, o.args);
            } else if (self.isRecognisedUser(user, channel) && self.commands.recognised[o.command]) {
                self.commands.recognised[o.command].call(self, user, channel, o.args);
            } else if (self.isAdminUser(user, channel) && self.commands.admin[o.command]) {
                self.commands.admin[o.command].call(self, user, channel, o.args);
            }
        } else {
            self.stateData[channel].states.forEach(function(state) {
                self.listeners[state].forEach(function(func) {
                    func.call(self, user, channel, message);
                });
            });   
        }
    });
}

Bot.prototype.commands = {
    admin: {},
    recognised: {},
    all: {}
}

Bot.prototype.listeners = {
    // states go here, and listener hooks in a list
    motion: [function(user, channel, message) {
        var value;

        if (message == "aye" || message == "nay" || message == "abstain") {
            if (this.isRecognisedUser(user, channel)) {
                value = (message == "aye" ? true : message == "nay" ? false : null);
                this.stateData[channel].motion.votes[user] = value;
            };
        }
    }]
}

/* BOT SNACKS */

Bot.prototype.addRecognisedUser = function(user) {

}

Bot.prototype.addAdminUser = function(user) {

}

Bot.prototype.removeRecognisedUser = function(user) {

}

Bot.prototype.removeAdminUser = function(user) {

}

Bot.prototype.isRecognisedUser = function(user, channel) {
    return true;
}

Bot.prototype.isAdminUser = function(user, channel) {
    return true;
}

Bot.prototype.onJoin = function(channel) {
    this.stateData[channel] = {
        recognised: [],
        mode: "simple",
        meeting: {
            name: null,
            started: false,
            quorum: 0
        },
        motion: {
            text: null,
            putBy: null,
            votes: []
        },
        states: []
    }
}

Bot.prototype.isOperator = function(name, channel) {
    return this.client.chans[channel] && this.client.chans[channel].users[name].indexOf("@") > -1;
}

Bot.prototype.isVoiced = function(name, channel) {
    return this.client.chans[channel] && this.client.chans[channel].users[name].indexOf("+") > -1;
}

/* COMMANDS OF DELIGHT */

Bot.prototype.commands.admin.start = function(user, channel, args) {
    if (args.length < 1) {

    }

    if (args[0] == "meeting") {
        this.stateData[channel].meeting.started = true;
        this.client.notice(channel, "*** Meeting started.");
        
        if (this.stateData[channel].meeting.name) {
            return;
        }
    }

    else if (args[0] == "motion") {
        // args: start, stop, cancel
        if (!this.stateData[channel].meeting.started) {
            this.client.notice(channel, "*** No meeting started.");
            return;
        }

        if (this.stateData[channel].states.indexOf('motion') > -1) {
            return;
        }
        
        this.stateData[channel].states.push("motion");
        this.client.notice(channel, '*** MOTION: ' + this.stateData[channel].motion.text);
        this.client.notice(channel, '*** Put by: ' + this.stateData[channel].motion.putBy);
        this.client.notice(channel, '*** Please now respond either "aye", "nay" or "abstain" to record a vote.');
    }
}

Bot.prototype.commands.admin.stop = function(user, channel, args) {
    var i, ayes = [], nays = [], abstains = [];

    if (args[0] == "meeting") {
        if (!this.stateData[channel].meeting.started) {
            // XXX make it error as there is no meeting
        }
        
        // TODO save the meeting data
        
        this.stateData[channel].meeting = {
            name: null, started: false   
        };

        this.client.notice(channel, "*** Meeting ended.");

    } else if (args[0] == "motion") {
        for (var nick in this.stateData[channel].motion.votes) {
            if (!this.client.chans[channel].users[nick]) {
                continue;
            }
    
            if (this.stateData[channel].motion.votes[nick] == true) {
                ayes.push(nick);
            } else if (this.stateData[channel].motion.votes[nick] == false) {
                nays.push(nick);
            } else {
                abstains.push(nick);
            }
        }
    
        this.client.notice(channel, "*** Ayes: " + ayes.length + " (" + ayes.join(", ") +
                "); Nays: " + nays.length + " (" + nays.join(", ") +
                "); Abstains: " + abstains.length + " (" + abstains.join(", ") + ")");
       
        if (ayes.length + nays.length + abstains.length < this.stateData[channel].quorum) {
            this.client.notice(channel, "*** Quorum not met.");
        } else if (ayes.length - nays.length > 0) {
            this.client.notice(channel, "*** Motion carries.");
        } else {
            this.client.notice(channel, "*** Motion lapses.");
        }
        
        this.stateData[channel].motion = {
            text: null,
            putBy: null,
            votes: []
        };
        
        this.stateData[channel].states.remove("motion");
    }
}

Bot.prototype.commands.admin.meeting = function(user, channel, args) {
    var meetingName;

    // args: name <foo>, start/begin, stop/end (adjourn implied)
    if (args.length == 0) {
        if (!this.stateData[channel].meeting.started) {
            // XXX make it error as there is no meeting
        }
        this.client.notice(channel, "*** Current meeting: " + this.stateData[channel].meeting.name);
    } else {
        this.stateData[channel].meeting.name = args.join(" ");
        this.client.notice(channel, "*** Meeting: " + this.stateData[channel].meeting.name);
    }
}

Bot.prototype.commands.admin.motion = function(user, channel, args) {
    var i, ayes = [], nays = [], abstains = [];
    
    // args: start, stop, cancel
    if (!this.stateData[channel].meeting.started) {
        this.client.notice(channel, "*** No meeting started.");
        return;
    }

    if (args.length > 0) {
        this.stateData[channel].motion.text = args.join(" ").trim();
        this.stateData[channel].motion.putBy = user;
        this.client.notice(channel, "*** Proposed motion text: " + args.join(" ").trim());
    } else {
        if (this.stateData[channel].motion.text) {
            this.client.notice(channel, "*** Proposed motion text: " + this.stateData[channel].motion.text);
        } else {
            this.client.notice(channel, "*** No currently proposed motion text.");
        }
    }
}

Bot.prototype.commands.admin.quorum = function(user, channel, args) {
    if (!this.stateData[channel].meeting.started) {
        // XXX make it error as there is no meeting
    }
    
    if (args.length < 1) {
        // XXX
    } else {
        this.stateData[channel].meeting.quorum = parseInt(args[0], 10);
        this.client.notice(channel, "*** Quorum now set to: " + parseInt(args[0], 10));
    }
}

Bot.prototype.commands.admin.recognise = function(user, channel, args) {
    // args: <nick>
}

new Bot('au.pirateirc.net', 'MotionBot', {channels: ['#ppau-nc']});

/*
var irc = require('irc');
var client = new irc.Client('au.pirateirc.net', 'MotionBot', {
    channels: ['#ppau-nc'],
});

var state = null,
    mode = "o",
    ctrl = "!",
    votes = {},
    recognise = {},
    quorum = 0;

function isOperator(name, channel) {
    return client.chans[channel] && client.chans[channel].users[name] == "@";
}

function isVoiced(name, channel) {
    return client.chans[channel] && 
        (client.chans[channel].users[name] == "@" ||
         client.chans[channel].users[name] == "+"); 
}

function hasMotionPower(name, channel) {
    return mode == "o" ? isOperator(name, channel) : 
           mode == "v" ? isVoiced(name, channel) : false;
}

function addRecognise(channel, nick) {
    if (!recognise[channel]) {
        recognise[channel] = [];
    }

    client.whois(nick, function(data) {
        recognise[channel].push(data.user + "!" + data.host);
        client.send("MODE", channel, "+v", nick);
    });
}

function ifRecognised(channel, nick, callback) {
    client.whois(nick, function(data) {
        if (recognise[channel] && recognise[channel].indexOf(data.user + "!" + data.host) > -1) {
            callback();
        }
    });
}

function isCommand(cmd, message) {
    return new RegExp("^" + ctrl + cmd).test(message);
}

function tallyResults(channel) {
    var ayes = 0, nays = 0, abstains = 0;

    for (var nick in votes[channel]) {
        if (!client.chans[channel].users[nick]) {
            continue;
        }

        if (votes[channel][nick] == true) {
            ayes++;
        } else if (votes[channel][nick] == false) {
            nays++;
        } else {
            abstains++;
        }
    }

    return {ayes: ayes, nays: nays, abstains: abstains};
}

function majorityCheck(res) {
    var total = res.ayes + res.nays + res.abstains;
    if (total < quorum) {
        return "*** Quorum not met.";
    }
    if (res.ayes - res.nays > 0) {
        return "*** Motion carries.";
    } else {
        return "*** Motion lapses.";
    }
}


client.addListener('message', function(from, to, message) {
    if (isCommand('', message)) {
        if (hasMotionPower(from, to)) {
            var command = parseCommand(message);
            console.log(command);
            if (command == null) {
                ;
            } else if (command.command == "motion" && command.args && state == null) {
                state = "motion";
                votes[to] = {};
                client.notice(to, '*** MOTION: ' + command.args.trim());
                client.notice(to, '*** Please now respond either "aye", "nay" or "abstain" to record a vote.');
            } else if (command.command == "cancel" && state == "motion") {
                client.notice(to, "*** Motion cancelled.")
                state = null;
                votes[to] = {};
            } else if (command.command == "stop" && state == "motion") {
                client.notice(to, '*** VOTING PERIOD HAS NOW ENDED');
                var res = tallyResults(to);
                client.notice(to, "*** Ayes: " + res.ayes + ", Nays: " + res.nays + ", Abstains: " + res.abstains);
                client.notice(to, majorityCheck(res));
                state = null;
                votes[to] = {};
            }
        }
        
        if (isOperator(from, to)) {
            if (command.command == "quorum") {
                quorum = parseInt(command.args, 10);
                client.notice(to, "*** Quorum now set to: " + quorum);
            } else if (command.command == "mode" && command.args) {
                if (command.args == "v") {
                    client.notice(to, "*** Any voiced user may raise a motion.");
                    mode = "v";
                } else if (command.args == "o") {
                    client.notice(to, "*** Only operators may raise a motion.");
                    mode = "o";
                }
            } else if (command.command == "recognise") {
                addRecognise(to, command.args);
            }
        }
    }
    
    if (state == "motion") {
        if (message == "aye" || message == "nay" || message == "abstain") {
            if (isVoiced(from, to)) {
                votes[to][from] = message == "aye" ? true : message == "nay" ? false : null;
            };
        }
    }
});

client.addListener('error', function(error) {
    console.log("Error: ", error);
});
*/
