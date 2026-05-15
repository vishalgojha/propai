package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Broker
import kotlinx.coroutines.flow.Flow

@Dao
interface BrokerDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(broker: Broker): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(brokers: List<Broker>)

    @Update
    suspend fun update(broker: Broker)

    @Delete
    suspend fun delete(broker: Broker)

    @Query("SELECT * FROM brokers WHERE id = :id")
    suspend fun getById(id: Long): Broker?

    @Query("SELECT * FROM brokers WHERE phone = :phone")
    suspend fun getByPhone(phone: String): Broker?

    @Query("SELECT * FROM brokers WHERE isActive = 1 ORDER BY name ASC")
    fun getAllActive(): Flow<List<Broker>>

    @Query("SELECT * FROM brokers ORDER BY name ASC")
    fun getAll(): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE city = :city AND isActive = 1 ORDER BY name ASC")
    fun getByCity(city: String): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE locality LIKE '%' || :locality || '%' AND isActive = 1")
    fun getByLocality(locality: String): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE pincode = :pincode AND isActive = 1")
    fun getByPincode(pincode: String): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE specialization = :specialty AND isActive = 1")
    fun getBySpecialization(specialty: String): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE (:city IS NULL OR city = :city) AND (:specialty IS NULL OR specialization = :specialty) AND isActive = 1 ORDER BY performanceScore DESC")
    fun searchByCityAndSpecialty(city: String?, specialty: String?): Flow<List<Broker>>

    @Query("SELECT * FROM brokers WHERE tags LIKE '%' || :tag || '%' AND isActive = 1")
    fun getByTag(tag: String): Flow<List<Broker>>

    @Query("UPDATE brokers SET isActive = 0 WHERE id = :id")
    suspend fun deactivate(id: Long)

    @Query("UPDATE brokers SET isActive = 1 WHERE id = :id")
    suspend fun activate(id: Long)

    @Query("UPDATE brokers SET performanceScore = :score WHERE id = :id")
    suspend fun updateScore(id: Long, score: Double)

    @Query("SELECT COUNT(*) FROM brokers")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM brokers WHERE isActive = 1")
    suspend fun countActive(): Int

    @Query("DELETE FROM brokers")
    suspend fun deleteAll()
}