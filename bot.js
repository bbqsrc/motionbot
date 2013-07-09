var irc = require('irc');
var client = new irc.Client('ircurl', 'MotionBot', {
    channels: ['#foo'],
});

var state = null,
    ctrl = "!",
    votes = {},
    recognise = {};

String.prototype.startsWith = function(starter) {
    return new RegExp("^" + starter).test(this);
}

function isOperator(name, channel) {
    return client.chans[channel] && client.chans[channel].users[name] == "@";
}

function isVoiced(name, channel) {
    return client.chans[channel] && 
        (client.chans[channel].users[name] == "@" ||
         client.chans[channel].users[name] == "+"); 
}

function addRecognise(channel, nick) {
    if (!recognise[channel]) {
        recognise[channel] = [];
    }

    client.whois(nick, function(data) {
        recognise[channel].push(data.user + "!" + data.host);
        client.say(channel, data.user + "!" + data.host + " will now be recognised.");
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

client.addListener('join', function(channel, nick, data) {
    console.log("JOIN", channel, nick, data);
    if (recognise[channel] && recognise[channel].indexOf(data.user + "!" + data.host) > -1) {
        client.send("MODE", channel, "+v", nick);
    }
});

client.addListener('message', function(from, to, message) {
    if (isCommand('', message)) {
        if (isOperator(from, to)) {
            if (isCommand('motion', message) && state == null) {
                state = "motion";
                votes[to] = {};
                client.notice(to, '= MOTION: ' + message.split(ctrl + 'motion ')[1] + " =");
                client.notice(to, '= Please now response either "aye", "nay" or "abstain" to record a vote. =');
            } else if (isCommand('stop', message) && state == "motion") {
                client.notice(to, '= VOTING PERIOD HAS NOW ENDED. =');
                var res = tallyResults(to);
                client.notice(to, "Ayes: " + res.ayes + " :: Nays: " + res.nays + " :: Abstains: " + res.abstains);
                state = null;
                votes[to] = {};
            } else if (isCommand('recognise', message)) {
                addRecognise(to, message.split(ctrl + 'recognise ')[1]);
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

