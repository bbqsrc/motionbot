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
        if (self.stateData[channel].recognised.indexOf(data.user + "!" + data.host) > -1) {
            client.send("MODE", channel, "+v", nick);
        }
    });

    client.addListener('message', function(user, channel, message) {
        var o;

        console.log(arguments);

        if (channel == name) {
            return;
        }

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

    client.addListener('error', function(error) {
        console.error("Error: ", error);
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

        message = message.trim().toLowerCase();

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

Bot.prototype.commands.admin.cancel = function(user, channel, args) {
    if (args[0] == "motion") {
        this.stateData[channel].motion = {
            text: null,
            putBy: null,
            votes: []
        };

        this.stateData[channel].states.remove("motion");

        this.client.notice(channel, "*** Motion cancelled.");
    } else {
        this.client.notice(channel, "*** Unknown argument.");
    }
}

Bot.prototype.commands.admin.stop = function(user, channel, args) {
    var i, ayes = [], nays = [], abstains = [],
        votes = { ayes: 0, nays: 0, abstains: 0 },
        extraAyes = 0, extraNays = 0;

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
        if (this.stateData[channel].states.indexOf('motion') == -1) {
            this.client.notice(channel, "*** There is no motion to stop.");
            return;
        }

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

        extraAyes = this.stateData[channel].motion.extraAyes || 0;
        extraNays = this.stateData[channel].motion.extraNays || 0;

        votes.ayes = ayes.length + extraAyes;
        votes.nays = nays.length + extraNays;
        votes.abstains = abstains.length;

        this.client.notice(channel, "*** Votes");
        this.client.notice(channel, "Ayes: " + (ayes.join(", ") || "none") +
                "; Nays: " + (nays.join(", ") || "none") +
                "; Abstains: " + (abstains.join(", ") || "none"));

        if (extraAyes > 0 || extraNays > 0) {
            this.client.notice(channel, "[+] External ayes: " + extraAyes +
                               "; External nays: " + extraNays);
        }

        var total = votes.ayes + votes.nays + votes.abstains;
        var quorum = this.stateData[channel].meeting.quorum;

        this.client.notice(channel, "*** Tally");
        this.client.notice(channel, "Ayes: " + votes.ayes + "; Nays: " +
                           votes.nays + "; Abstains: " + votes.abstains +
                           "; TOTAL: " + total);


        var pcInFavour = (votes.ayes / (votes.ayes + votes.nays) * 100).toFixed(2);

        if (total < quorum) {
            this.client.notice(channel, "*** Result: Quorum of " + quorum + " not met.");
        } else if (votes.ayes - votes.nays > 0) {
            this.client.notice(channel, "*** Result: " + pcInFavour + "% in favour. Motion carries.");
        } else {
            this.client.notice(channel, "*** Result: " + pcInFavour + "% in favour. Motion lapses.");
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
    // args: start, stop, cancel
    if (!this.stateData[channel].meeting.started) {
        this.client.notice(channel, "*** No meeting started.");
        return;
    }
    if (args.length < 1) {
        this.client.notice(channel, "*** Quorum is: " +
                           this.stateData[channel].meeting.quorum || 0);
    } else {
        this.stateData[channel].meeting.quorum = parseInt(args[0], 10);
        this.client.notice(channel, "*** Quorum now set to: " + parseInt(args[0], 10));
    }
}

Bot.prototype.commands.admin.ayes = function(user, channel, args) {
    if (!this.stateData[channel].meeting.started) {
        this.client.notice(channel, "*** No meeting started.");
        return;
    }

    if (this.stateData[channel].states.indexOf('motion') == -1) {
        this.client.notice(channel, "*** No motion started.");
        return;
    }

    var x = parseInt(args[0], 10);

    if (x !== x) { // NaN check
        this.client.notice(channel, "*** Invalid input.");
        return;
    }

    this.stateData[channel].motion.extraAyes = x;
    this.client.notice(channel, "*** Extra ayes: " + x);

}


Bot.prototype.commands.admin.nays = function(user, channel, args) {
    if (!this.stateData[channel].meeting.started) {
        this.client.notice(channel, "*** No meeting started.");
        return;
    }

    if (this.stateData[channel].states.indexOf('motion') == -1) {
        this.client.notice(channel, "*** No motion started.");
        return;
    }

    var x = parseInt(args[0], 10);

    if (x !== x) { // NaN check
        this.client.notice(channel, "*** Invalid input.");
        return;
    }

    this.stateData[channel].motion.extraNays = x;
    this.client.notice(channel, "*** Extra nays: " + x);

}

Bot.prototype.commands.admin.add = function(user, channel, args) {
    // args: <nick>
    var nick = args[0],
        self = this;

    self.client.whois(nick, function(data) {
        self.stateData[channel].recognised.push(data.user + "!" + data.host);
        self.client.send("MODE", channel, "+v", nick);
    });
}

if (process.argv.length < 5) {
    console.log("Usage: bot.js [name] [server] [channel]");
} else {
    console.log(process.argv);
    new Bot(process.argv[3], process.argv[2], {channels: [process.argv[4]]});
}

