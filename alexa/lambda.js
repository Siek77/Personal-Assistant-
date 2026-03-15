// JARVIS Alexa Skill — AWS Lambda handler
// Runtime: Node.js 18.x
//
// Required Lambda environment variables:
//   VOICE_API_URL  — your Vercel deployment e.g. https://your-site.vercel.app
//   VOICE_SECRET   — must match VOICE_SECRET in Vercel env vars
//
// Deploy steps:
//   1. AWS Console → Lambda → Create function → Node.js 18.x
//   2. Paste this file as index.mjs (or zip and upload)
//   3. Set the env vars above under Configuration → Environment variables
//   4. Add trigger: Alexa Skills Kit → paste your Alexa Skill ID
//   5. Copy the Lambda ARN into your Alexa skill's Endpoint field

const VOICE_API_URL = process.env.VOICE_API_URL
const VOICE_SECRET = process.env.VOICE_SECRET || ''

// ── Call /api/voice on your Vercel deployment ──
async function askJarvis(text, sessionHistory = []) {
  if (!VOICE_API_URL) throw new Error('VOICE_API_URL not set')

  const res = await fetch(`${VOICE_API_URL}/api/voice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(VOICE_SECRET && { Authorization: `Bearer ${VOICE_SECRET}` }),
    },
    body: JSON.stringify({ text, sessionHistory }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Voice API ${res.status}: ${body}`)
  }

  return res.json() // { reply, actions, sessionHistory }
}

// ── Response builders ──
function respond(speech, sessionAttributes = {}, endSession = false) {
  return {
    version: '1.0',
    sessionAttributes,
    response: {
      outputSpeech: { type: 'PlainText', text: speech },
      reprompt: endSession ? undefined : {
        outputSpeech: { type: 'PlainText', text: 'Is there anything else?' },
      },
      shouldEndSession: endSession,
    },
  }
}

// ── Main handler ──
export const handler = async (event) => {
  const requestType = event.request.type
  const sessionAttrs = event.session?.attributes || {}

  // ── Launch: "Alexa, open JARVIS" ──
  if (requestType === 'LaunchRequest') {
    return respond('JARVIS online. How can I help?', sessionAttrs)
  }

  // ── Session ended (no response needed) ──
  if (requestType === 'SessionEndedRequest') {
    return { version: '1.0', response: {} }
  }

  // ── Intent handling ──
  if (requestType === 'IntentRequest') {
    const intent = event.request.intent.name

    if (intent === 'AMAZON.StopIntent' || intent === 'AMAZON.CancelIntent') {
      return respond('Goodbye.', {}, true)
    }

    if (intent === 'AMAZON.HelpIntent') {
      return respond(
        'Just say what you need. I can answer questions, control your home, or help you plan your day.',
        sessionAttrs
      )
    }

    if (intent === 'JarvisIntent') {
      const query = event.request.intent.slots?.query?.value
      if (!query) {
        return respond("I didn't catch that. What did you need?", sessionAttrs)
      }

      try {
        const history = sessionAttrs.sessionHistory || []
        const { reply, sessionHistory: newHistory } = await askJarvis(query, history)

        return respond(
          reply || "I didn't get a response. Please try again.",
          { sessionHistory: newHistory }
        )
      } catch (err) {
        console.error('[JARVIS] error:', err.message)
        return respond("Sorry, I ran into an issue. Please try again.", sessionAttrs)
      }
    }
  }

  return respond("I didn't understand that. What did you need?", sessionAttrs)
}
