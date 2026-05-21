package com.chaoscraft.wablaster.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chaoscraft.wablaster.ui.theme.BgCard
import com.chaoscraft.wablaster.ui.theme.BgDeep
import com.chaoscraft.wablaster.ui.theme.BgSurface
import com.chaoscraft.wablaster.ui.theme.BorderDim
import com.chaoscraft.wablaster.ui.theme.Brand
import com.chaoscraft.wablaster.ui.theme.TextMain
import com.chaoscraft.wablaster.ui.theme.TextMuted
import com.chaoscraft.wablaster.util.AuthManager
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(
    authManager: AuthManager,
    onAuthenticated: () -> Unit
) {
    var isLogin by remember { mutableStateOf(true) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDeep)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgSurface, RoundedCornerShape(24.dp))
                    .padding(40.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .background(Brand, RoundedCornerShape(16.dp))
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("W", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 28.sp)
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("WaBro ", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextMain, letterSpacing = (-0.5).sp)
                        Text("Pro", fontSize = 24.sp, fontWeight = FontWeight.Light, color = Brand, letterSpacing = (-0.5).sp)
                    }
                    Text("Powered by PropAI", fontSize = 10.sp, color = TextMuted, letterSpacing = 3.sp)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgSurface, RoundedCornerShape(24.dp))
                    .padding(40.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(BgDeep, RoundedCornerShape(12.dp))
                            .padding(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    isLogin = true
                                    error = ""
                                }
                                .background(
                                    if (isLogin) BgCard else Color.Transparent,
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Sign In",
                                color = if (isLogin) Brand else TextMuted,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                letterSpacing = 2.sp
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    isLogin = false
                                    error = ""
                                }
                                .background(
                                    if (!isLogin) BgCard else Color.Transparent,
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Register",
                                color = if (!isLogin) Brand else TextMuted,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                letterSpacing = 2.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    AnimatedVisibility(
                        visible = !isLogin,
                        enter = fadeIn() + slideInVertically()
                    ) {
                        Column {
                            Text("FULL NAME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                            OutlinedTextField(
                                value = name,
                                onValueChange = { name = it },
                                placeholder = { Text("John Doe", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = TextMuted) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Brand,
                                    unfocusedBorderColor = BorderDim,
                                    focusedContainerColor = BgDeep,
                                    unfocusedContainerColor = BgDeep,
                                    focusedTextColor = TextMain,
                                    unfocusedTextColor = TextMain,
                                    cursorColor = Brand
                                ),
                                textStyle = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            Text("WHATSAPP NUMBER", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                            OutlinedTextField(
                                value = phone,
                                onValueChange = { phone = it },
                                placeholder = { Text("+91 98XXXXXXXX", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = TextMuted) },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Brand,
                                    unfocusedBorderColor = BorderDim,
                                    focusedContainerColor = BgDeep,
                                    unfocusedContainerColor = BgDeep,
                                    focusedTextColor = TextMain,
                                    unfocusedTextColor = TextMain,
                                    cursorColor = Brand
                                ),
                                textStyle = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                    }

                    Text("EMAIL ADDRESS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        placeholder = { Text("name@company.com", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                        leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = TextMuted) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Brand,
                            unfocusedBorderColor = BorderDim,
                            focusedContainerColor = BgDeep,
                            unfocusedContainerColor = BgDeep,
                            focusedTextColor = TextMain,
                            unfocusedTextColor = TextMain,
                            cursorColor = Brand
                        ),
                        textStyle = MaterialTheme.typography.bodyMedium
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text("PASSWORD", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        placeholder = { Text("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = TextMuted) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Brand,
                            unfocusedBorderColor = BorderDim,
                            focusedContainerColor = BgDeep,
                            unfocusedContainerColor = BgDeep,
                            focusedTextColor = TextMain,
                            unfocusedTextColor = TextMain,
                            cursorColor = Brand
                        ),
                        textStyle = MaterialTheme.typography.bodyMedium
                    )

                    AnimatedVisibility(visible = !isLogin) {
                        Column {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("CONFIRM PASSWORD", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 2.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
                            OutlinedTextField(
                                value = confirmPassword,
                                onValueChange = { confirmPassword = it },
                                placeholder = { Text("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", color = TextMuted.copy(alpha = 0.3f), fontSize = 14.sp) },
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = TextMuted) },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Brand,
                                    unfocusedBorderColor = BorderDim,
                                    focusedContainerColor = BgDeep,
                                    unfocusedContainerColor = BgDeep,
                                    focusedTextColor = TextMain,
                                    unfocusedTextColor = TextMain,
                                    cursorColor = Brand
                                ),
                                textStyle = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }

                    AnimatedVisibility(visible = error.isNotBlank()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp)
                                .background(Color(0x1AFF0000), RoundedCornerShape(12.dp))
                                .padding(16.dp)
                        ) {
                            Text("Error: $error", color = Color(0xFFFF6B6B), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            scope.launch {
                                error = ""
                                if (password.length < 6) {
                                    error = "Password must be at least 6 characters"
                                    return@launch
                                }
                                if (!isLogin && password != confirmPassword) {
                                    error = "Passwords do not match"
                                    return@launch
                                }
                                if (!isLogin && (name.isBlank() || phone.isBlank())) {
                                    error = "Full name and WhatsApp number are required"
                                    return@launch
                                }
                                loading = true
                                val result = if (isLogin) {
                                    authManager.signIn(email, password)
                                } else {
                                    authManager.signUp(email, password, name, phone)
                                }
                                loading = false
                                result.fold(
                                    onSuccess = { onAuthenticated() },
                                    onFailure = { error = it.message ?: "Authentication failed" }
                                )
                            }
                        },
                        enabled = !loading && email.isNotBlank() && password.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Brand)
                    ) {
                        if (loading) {
                            SafeLoadingIndicator(color = Color.Black, dotSize = 4.dp, modifier = Modifier.size(20.dp))
                        } else {
                            Text(
                                if (isLogin) "SIGN IN" else "CREATE ACCOUNT",
                                fontWeight = FontWeight.Bold,
                                color = Color.Black,
                                fontSize = 12.sp,
                                letterSpacing = 3.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        if (isLogin) "Don't have an account? Register" else "Already have an account? Sign In",
                        color = Brand,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clickable {
                                isLogin = !isLogin
                                error = ""
                            }
                            .padding(8.dp)
                    )
                }
            }
        }
    }
}
